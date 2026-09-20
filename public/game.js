let allTrophies = [];

function getGameIdFromUrl() {
    const segments = window.location.pathname.split("/").filter(Boolean);
    return segments[segments.length - 1];
}

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

function renderTrophies(trophiesToRender) {
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

function updateStatistics(trophies) {
    const total = trophies.length;
    const earned = trophies.filter(t => t.earned).length;
    const progressPercent = total > 0 ? Math.round((earned / total) * 100) : 0;

    // Busca o status do troféu de platina
    const platinumTrophy = trophies.find(t => t.type?.toLowerCase() === "platinum");
    const isPlatEarned = Boolean(platinumTrophy && platinumTrophy.earned);

    // Atualiza o Card Hero da Platina
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

    // Contagem apenas dos troféus conquistados
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

function setupFilters() {
    const buttons = document.querySelectorAll(".filter-btn");
    buttons.forEach(btn => {
        btn.addEventListener("click", () => {
            buttons.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");

            const filter = btn.dataset.filter;
            if (filter === "earned") {
                renderTrophies(allTrophies.filter(t => t.earned));
            } else if (filter === "missing") {
                renderTrophies(allTrophies.filter(t => !t.earned));
            } else {
                renderTrophies(allTrophies);
            }
        });
    });
}

async function loadGameDetails() {
    const gameId = getGameIdFromUrl();
    const listContainer = document.getElementById("trophies-list");

    if (!gameId) {
        if (listContainer) listContainer.innerHTML = `<p class="error-message">ID do jogo não informado na URL.</p>`;
        return;
    }

    try {
        const queryParams = window.location.search;
        const response = await fetch(`/api/games/${gameId}${queryParams}`);
        if (!response.ok) {
            throw new Error(`Erro ao buscar jogo: status ${response.status}`);
        }

        const data = await response.json();
        allTrophies = data.trophies || [];

        updateStatistics(allTrophies);
        renderTrophies(allTrophies);
        setupFilters();

    } catch (error) {
        console.error("Erro ao carregar detalhes do jogo:", error);
        if (listContainer) {
            listContainer.innerHTML = `
                <div class="error-message">
                    <p>Não foi possível carregar os troféus deste jogo.</p>
                    <button onclick="loadGameDetails()">Tentar Novamente</button>
                </div>
            `;
        }
    }
}

document.addEventListener("DOMContentLoaded", loadGameDetails);