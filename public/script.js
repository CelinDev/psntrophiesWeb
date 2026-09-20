let allGames = [];
let currentGameTrophies = [];
let currentAccountId = "me";
let currentUsername = "";

// ========================================
// RENDERIZAÇÃO DA LISTA PRINCIPAL
// ========================================
function renderGameCards(gamesList) {
    const gamesContainer = document.getElementById("games");
    if (!gamesContainer) return;

    gamesContainer.innerHTML = "";

    if (gamesList.length === 0) {
        gamesContainer.innerHTML = `<p class="empty-state">Nenhum jogo encontrado para esta conta.</p>`;
        return;
    }

    const fragment = document.createDocumentFragment();

    for (const game of gamesList) {
        const card = document.createElement("div");
        card.classList.add("game-card");
        card.dataset.gameId = game.id;
        if (game.platform) card.dataset.platform = game.platform;

        card.addEventListener("click", () => {
            openGameModal(game.id, game.platform);
        });

        const isPlat = game.platinum > 0;

        card.innerHTML = `
            <div class="card-cover-wrapper">
                <img
                    src="${game.icon}"
                    alt="${game.name}"
                    loading="lazy"
                    class="game-cover-img"
                >
                ${isPlat ? `<img src="/platinum.png" alt="Platinado" class="platinum-badge" title="Jogo Platinado">` : ""}
            </div>

            <h3>${game.name}</h3>
            <div class="platform">${game.platform}</div>
            <div class="progress-container">
                <div class="progress" style="width: ${game.progress}%;"></div>
            </div>
            <div class="trophies">
                <span>📊 ${game.progress}%</span>
                <span>🏆 ${game.earned}/${game.total} troféus</span>
            </div>
        `;

        fragment.appendChild(card);
    }

    gamesContainer.appendChild(fragment);
}

// ========================================
// ORDENAÇÃO
// ========================================
function handleSort(orderType) {
    let sorted = [...allGames];

    switch (orderType) {
        case "progress-desc":
            sorted.sort((a, b) => b.progress - a.progress);
            break;
        case "progress-asc":
            sorted.sort((a, b) => a.progress - b.progress);
            break;
        case "name-asc":
            sorted.sort((a, b) => a.name.localeCompare(b.name));
            break;
        case "name-desc":
            sorted.sort((a, b) => b.name.localeCompare(a.name));
            break;
        case "platinum-first":
            sorted.sort((a, b) => (b.platinum > 0 ? 1 : 0) - (a.platinum > 0 ? 1 : 0));
            break;
        case "default":
        default:
            break;
    }

    renderGameCards(sorted);
}

// ========================================
// MODAL DE DETALHES
// ========================================
function formatDate(dateString) {
    if (!dateString) return "";
    const date = new Date(dateString);
    return date.toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    });
}

function renderModalTrophies(trophiesToRender) {
    const listContainer = document.getElementById("trophies-list");
    if (!listContainer) return;

    listContainer.innerHTML = "";

    if (trophiesToRender.length === 0) {
        listContainer.innerHTML = `<p class="empty-state">Nenhum troféu encontrado para este filtro.</p>`;
        return;
    }

    const fragment = document.createDocumentFragment();

    for (const trophy of trophiesToRender) {
        const item = document.createElement("div");
        item.classList.add("trophy-item");
        if (trophy.earned) item.classList.add("earned");
        if (trophy.type) item.classList.add(trophy.type.toLowerCase());

        const iconSrc = trophy.iconUrl || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='50' height='50' fill='%23555'%3E%3Crect width='50' height='50'/%3E%3C/svg%3E";

        item.innerHTML = `
            <img class="trophy-icon" src="${iconSrc}" alt="${trophy.name || 'Troféu'}" loading="lazy">
            <div class="trophy-info">
                <div class="trophy-title">
                    <h4>${trophy.hidden && !trophy.earned ? "Troféu Oculto" : (trophy.name || "Sem nome")}</h4>
                    <span class="trophy-badge ${trophy.type?.toLowerCase()}">${trophy.type || "Desconhecido"}</span>
                </div>
                <p class="trophy-desc">
                    ${trophy.hidden && !trophy.earned ? "Troféu secreto da história ou conquista oculta." : (trophy.detail || "")}
                </p>
                <div class="trophy-footer">
                    <span class="trophy-status ${trophy.earned ? "status-earned" : "status-missing"}">
                        ${trophy.earned ? "✓ Conquistado" : "⏳ Faltando"}
                    </span>
                    ${trophy.earned && trophy.earnedDateTime ? `<span class="trophy-date">${formatDate(trophy.earnedDateTime)}</span>` : ""}
                </div>
            </div>
        `;

        fragment.appendChild(item);
    }

    listContainer.appendChild(fragment);
}

function updateModalStatistics(trophies) {
    const total = trophies.length;
    const earned = trophies.filter(t => t.earned).length;
    const progressPercent = total > 0 ? Math.round((earned / total) * 100) : 0;

    const platinumTrophy = trophies.find(t => t.type?.toLowerCase() === "platinum");
    const isPlatEarned = Boolean(platinumTrophy && platinumTrophy.earned);

    const platCard = document.getElementById("platinum-badge-card");
    const platText = document.getElementById("platinum-status-text");

    if (platCard && platText) {
        if (isPlatEarned) {
            platCard.classList.remove("not-earned");
            platCard.classList.add("earned");
            platText.textContent = "PLATINADO";
        } else {
            platCard.classList.remove("earned");
            platCard.classList.add("not-earned");
            platText.textContent = "NÃO PLATINADO";
        }
    }

    const countEarned = type => 
        trophies.filter(t => t.type?.toLowerCase() === type.toLowerCase() && t.earned).length;

    const setVal = (id, text) => {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    };

    setVal("game-progress", `${progressPercent}%`);
    setVal("game-earned", `${earned}/${total}`);
    setVal("stat-gold", countEarned("gold"));
    setVal("stat-silver", countEarned("silver"));
    setVal("stat-bronze", countEarned("bronze"));
}

function setupModalFilters() {
    const buttons = document.querySelectorAll(".filter-btn");
    buttons.forEach(btn => {
        btn.onclick = () => {
            buttons.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");

            const filter = btn.dataset.filter;
            if (filter === "earned") {
                renderModalTrophies(currentGameTrophies.filter(t => t.earned));
            } else if (filter === "missing") {
                renderModalTrophies(currentGameTrophies.filter(t => !t.earned));
            } else {
                renderModalTrophies(currentGameTrophies);
            }
        };
    });
}

async function openGameModal(gameId, platform = "") {
    const modal = document.getElementById("game-modal");
    const listContainer = document.getElementById("trophies-list");

    if (modal) modal.classList.add("open");
    document.body.style.overflow = "hidden";

    if (listContainer) {
        listContainer.innerHTML = `<p class="loading">Carregando detalhes e troféus...</p>`;
    }

    try {
        let fetchUrl = `/api/games/${gameId}?accountId=${currentAccountId}`;
        if (platform) fetchUrl += `&platform=${encodeURIComponent(platform)}`;
        const response = await fetch(fetchUrl);
        if (!response.ok) throw new Error("Erro na requisição");

        const data = await response.json();
        currentGameTrophies = data.trophies || [];

        updateModalStatistics(currentGameTrophies);
        renderModalTrophies(currentGameTrophies);
        setupModalFilters();

    } catch (err) {
        console.error(err);
        if (listContainer) {
            listContainer.innerHTML = `<p class="error-message">Não foi possível carregar os troféus.</p>`;
        }
    }
}

function closeGameModal() {
    const modal = document.getElementById("game-modal");
    if (modal) modal.classList.remove("open");
    document.body.style.overflow = "auto";
}

// ========================================
// CARREGAMENTO COM COOLDOWN & SYNC
// ========================================
function startCooldownTimer(seconds = 30) {
    const syncBtn = document.getElementById("sync-btn");
    if (!syncBtn) return;

    syncBtn.disabled = true;
    let remaining = seconds;

    const interval = setInterval(() => {
        syncBtn.textContent = `Aguarde (${remaining}s)`;
        remaining--;

        if (remaining < 0) {
            clearInterval(interval);
            syncBtn.disabled = false;
            syncBtn.textContent = "🔄 Sincronizar";
        }
    }, 1000);
}

async function loadGames(username = "", forceRefresh = false) {
    const gamesContainer = document.getElementById("games");
    const banner = document.getElementById("searched-user-banner");
    const resetBtn = document.getElementById("reset-search-btn");

    if (gamesContainer) gamesContainer.innerHTML = `<p class="loading">Carregando perfil e troféus...</p>`;

    try {
        currentUsername = username;
        let url = `/api/games?`;
        if (username) url += `user=${encodeURIComponent(username)}&`;
        if (forceRefresh) url += `refresh=true`;

        const response = await fetch(url);

        if (response.status === 429) {
            const errData = await response.json();
            alert(errData.error || "Aguarde para sincronizar novamente.");
            return;
        }

        if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.error || "Erro ao carregar dados.");
        }

        const { targetAccountId, profile, games = [], statistics = {} } = await response.json();
        allGames = games;
        currentAccountId = targetAccountId;

        if (forceRefresh) {
            startCooldownTimer(30);
        }

        if (profile) {
            banner.style.display = "flex";
            banner.innerHTML = `
                ${profile.avatarUrl ? `<img src="${profile.avatarUrl}" class="user-avatar" alt="${profile.onlineId}">` : ""}
                <div class="user-info">
                    <h3>Perfil: ${profile.onlineId}</h3>
                    ${profile.aboutMe ? `<p>${profile.aboutMe}</p>` : ""}
                </div>
            `;
            if (resetBtn) resetBtn.style.display = "inline-block";
        } else {
            banner.style.display = "none";
            if (resetBtn) resetBtn.style.display = "none";
        }

        const setElementText = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.textContent = val ?? 0;
        };

        setElementText("total-trophies", statistics.trophies);
        setElementText("total-platinum", statistics.platinum);
        setElementText("total-gold", statistics.gold);
        setElementText("total-silver", statistics.silver);
        setElementText("total-bronze", statistics.bronze);

        renderGameCards(allGames);

    } catch (error) {
        console.error("Erro ao carregar jogos:", error);
        if (gamesContainer) {
            gamesContainer.innerHTML = `
                <div class="error-message">
                    <p>${error.message}</p>
                    <button onclick="loadGames()">Voltar à Minha Conta</button>
                </div>
            `;
        }
    }
}

// ========================================
// CONTROLE DE TEMA & EVENTOS
// ========================================
function initTheme() {
    const savedTheme = localStorage.getItem("psn-theme") || "dark";
    const toggleBtn = document.getElementById("theme-toggle");
    const themeIcon = document.getElementById("theme-icon");

    if (savedTheme === "platinum-light") {
        document.body.classList.add("platinum-light");
        if (themeIcon) themeIcon.textContent = "☀️";
    } else {
        document.body.classList.remove("platinum-light");
        if (themeIcon) themeIcon.textContent = "🌙";
    }

    if (toggleBtn) {
        toggleBtn.addEventListener("click", () => {
            const isLight = document.body.classList.toggle("platinum-light");
            localStorage.setItem("psn-theme", isLight ? "platinum-light" : "dark");
            if (themeIcon) themeIcon.textContent = isLight ? "☀️" : "🌙";
        });
    }
}

document.addEventListener("DOMContentLoaded", () => {
    initTheme();
    loadGames();

    const sortSelect = document.getElementById("sort-select");
    if (sortSelect) {
        sortSelect.addEventListener("change", (e) => handleSort(e.target.value));
    }

    const searchForm = document.getElementById("search-form");
    const searchInput = document.getElementById("search-input");
    const syncBtn = document.getElementById("sync-btn");
    const resetBtn = document.getElementById("reset-search-btn");

    if (searchForm) {
        searchForm.addEventListener("submit", (e) => {
            e.preventDefault();
            const username = searchInput.value.trim();
            if (username) {
                loadGames(username, false);
            }
        });
    }

    if (syncBtn) {
        syncBtn.addEventListener("click", () => {
            loadGames(currentUsername, true);
        });
    }

    if (resetBtn) {
        resetBtn.addEventListener("click", () => {
            if (searchInput) searchInput.value = "";
            currentUsername = "";
            loadGames("", false);
        });
    }

    const closeBtn = document.getElementById("modal-close-btn");
    if (closeBtn) closeBtn.onclick = closeGameModal;

    const modal = document.getElementById("game-modal");
    if (modal) {
        modal.onclick = (e) => {
            if (e.target === modal) closeGameModal();
        };
    }

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") closeGameModal();
    });
});