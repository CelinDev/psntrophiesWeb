import "dotenv/config";
import express from "express";
import path from "path";
import NodeCache from "node-cache";
import {
    exchangeNpssoForAccessCode,
    exchangeAccessCodeForAuthTokens,
    exchangeRefreshTokenForAuthTokens,
    getProfileFromUserName,
    getUserTitles,
    getTitleTrophies,
    getUserTrophiesEarnedForTitle
} from "psn-api";

const app = express();
const PORT = process.env.PORT || 3000;

// stdTTL: 600 segundos (10 minutos de cache padrão)
const cache = new NodeCache({ stdTTL: 600, checkperiod: 120 });
const COOLDOWN_SECONDS = 30;

app.use(express.static("public"));

// ========================================
// GERENCIAMENTO DE AUTENTICAÇÃO
// ========================================
let authSession = null;
let tokenExpiresAt = 0;

async function getValidAuth() {
    const npsso = process.env.NPSSO;
    if (!npsso) throw new Error("NPSSO não foi encontrado no arquivo .env");

    const now = Date.now();
    if (authSession && now < tokenExpiresAt - 60000) return authSession;

    try {
        if (authSession?.refreshToken) {
            authSession = await exchangeRefreshTokenForAuthTokens(authSession.refreshToken);
        } else {
            const accessCode = await exchangeNpssoForAccessCode(npsso);
            authSession = await exchangeAccessCodeForAuthTokens(accessCode);
        }
        tokenExpiresAt = Date.now() + (authSession.expiresIn * 1000);
        return authSession;
    } catch {
        authSession = null;
        const accessCode = await exchangeNpssoForAccessCode(npsso);
        authSession = await exchangeAccessCodeForAuthTokens(accessCode);
        tokenExpiresAt = Date.now() + (authSession.expiresIn * 1000);
        return authSession;
    }
}

// ========================================
// API DE JOGOS (COM CACHE & FORCE REFRESH)
// ========================================

app.get("/api/games", async (req, res) => {
    try {
        const targetUser = req.query.user?.trim() || "me";
        const forceRefresh = req.query.refresh === "true";

        const cacheKey = `user_games_${targetUser.toLowerCase()}`;
        const cooldownKey = `cooldown_${targetUser.toLowerCase()}`;

        // 1. Checa Cooldown se forçar a atualização
        if (forceRefresh) {
            const inCooldown = cache.get(cooldownKey);
            if (inCooldown) {
                const ttlRemaining = Math.ceil((cache.getTtl(cooldownKey) - Date.now()) / 1000);
                return res.status(429).json({
                    error: `Aguarde ${ttlRemaining > 0 ? ttlRemaining : 1}s para sincronizar novamente.`
                });
            }
        }

        // 2. Entrega do cache se disponível e não foi forçado
        const cachedData = cache.get(cacheKey);
        if (!forceRefresh && cachedData) {
            return res.json({ ...cachedData, fromCache: true });
        }

        // 3. Consulta na Sony
        const auth = await getValidAuth();
        let targetAccountId = "me";
        let profileInfo = null;

        if (targetUser !== "me") {
            try {
                const profileRes = await getProfileFromUserName(
                    { accessToken: auth.accessToken },
                    targetUser
                );
                targetAccountId = profileRes.profile.accountId;
                profileInfo = {
                    onlineId: profileRes.profile.onlineId,
                    avatarUrl: profileRes.profile.avatarUrls?.[0]?.avatarUrl || null,
                    aboutMe: profileRes.profile.aboutMe || ""
                };
            } catch {
                return res.status(404).json({ error: "Usuário PSN não encontrado ou perfil privado." });
            }
        }

        const response = await getUserTitles(
            { accessToken: auth.accessToken },
            targetAccountId
        );

        const games = (response.trophyTitles || []).map(game => {
            const earned = game.earnedTrophies || { bronze: 0, silver: 0, gold: 0, platinum: 0 };
            const defined = game.definedTrophies || { bronze: 0, silver: 0, gold: 0, platinum: 0 };

            return {
                id: game.npCommunicationId,
                name: game.trophyTitleName,
                platform: game.trophyTitlePlatform,
                progress: game.progress,
                earned: earned.bronze + earned.silver + earned.gold + earned.platinum,
                total: defined.bronze + defined.silver + defined.gold + defined.platinum,
                bronze: earned.bronze,
                silver: earned.silver,
                gold: earned.gold,
                platinum: earned.platinum,
                icon: game.trophyTitleIconUrl
            };
        });

        const statistics = games.reduce(
            (acc, game) => {
                acc.games += 1;
                acc.trophies += game.earned;
                acc.platinum += game.platinum;
                acc.gold += game.gold;
                acc.silver += game.silver;
                acc.bronze += game.bronze;
                return acc;
            },
            { games: 0, trophies: 0, platinum: 0, gold: 0, silver: 0, bronze: 0 }
        );

        const payload = { targetAccountId, profile: profileInfo, statistics, games };

        // 4. Salva no cache e define cooldown
        cache.set(cacheKey, payload);
        if (forceRefresh) {
            cache.set(cooldownKey, true, COOLDOWN_SECONDS);
        }

        res.json({ ...payload, fromCache: false });
    } catch (error) {
        console.error("Erro em /api/games:", error);
        res.status(500).json({ error: "Erro ao buscar dados na PSN." });
    }
});

// ========================================
// API DE TROFÉUS POR JOGO (COM CACHE)
// ========================================

app.get("/api/games/:id", async (req, res) => {
    try {
        const gameId = req.params.id;
        const accountId = req.query.accountId || "me";
        const platform = req.query.platform?.toUpperCase();
        const forceRefresh = req.query.refresh === "true";
        const cacheKey = `game_trophies_${accountId}_${gameId}`;

        const cachedTrophies = cache.get(cacheKey);
        if (!forceRefresh && cachedTrophies) {
            return res.json({ ...cachedTrophies, fromCache: true });
        }

        const auth = await getValidAuth();

        // Para títulos de PS4, PS3 e PS Vita, o parâmetro npServiceName DEVE ser "trophy".
        // Para títulos de PS5, é "trophy2".
        const isLegacyPlatform = platform && (
            platform.includes("PS4") || platform.includes("PS3") || platform.includes("VITA")
        );
        const preferredService = isLegacyPlatform ? "trophy" : "trophy2";
        const fallbackService = isLegacyPlatform ? "trophy2" : "trophy";

        async function fetchTitleAndEarned(serviceName) {
            const options = { npServiceName: serviceName };
            const [titleTrophiesRes, earnedTrophiesRes] = await Promise.all([
                getTitleTrophies({ accessToken: auth.accessToken }, gameId, "all", options),
                getUserTrophiesEarnedForTitle({ accessToken: auth.accessToken }, accountId, gameId, "all", options)
            ]);
            return { titleTrophiesRes, earnedTrophiesRes };
        }

        let titleTrophiesRes;
        let earnedTrophiesRes;

        try {
            const result = await fetchTitleAndEarned(preferredService);
            titleTrophiesRes = result.titleTrophiesRes;
            earnedTrophiesRes = result.earnedTrophiesRes;
        } catch (err) {
            // Se falhar (por exemplo, plataforma não informada ou incompatível), tenta o outro serviço
            const fallbackResult = await fetchTitleAndEarned(fallbackService);
            titleTrophiesRes = fallbackResult.titleTrophiesRes;
            earnedTrophiesRes = fallbackResult.earnedTrophiesRes;
        }

        const earnedMap = new Map((earnedTrophiesRes.trophies || []).map(t => [t.trophyId, t]));

        const trophies = (titleTrophiesRes.trophies || []).map(trophy => {
            const userStatus = earnedMap.get(trophy.trophyId);
            return {
                id: trophy.trophyId,
                hidden: trophy.trophyHidden,
                name: trophy.trophyName,
                detail: trophy.trophyDetail,
                iconUrl: trophy.trophyIconUrl,
                type: trophy.trophyType,
                earned: userStatus?.earned ?? false,
                earnedDateTime: userStatus?.earnedDateTime ?? null,
                rare: trophy.trophyRare
            };
        });

        const payload = {
            gameId,
            trophySetVersion: titleTrophiesRes.trophySetVersion,
            trophies
        };

        cache.set(cacheKey, payload);
        res.json({ ...payload, fromCache: false });
    } catch (error) {
        console.error(`Erro em /api/games/${req.params.id}:`, error);
        res.status(500).json({ error: "Erro ao carregar detalhes dos troféus." });
    }
});

app.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
});