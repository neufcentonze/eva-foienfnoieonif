// ==UserScript==
// @name         E-Push Autonomous Survival
// @namespace    http://tampermonkey.net/
// @version      15.1 - Smooth and Aware
// @description  Pilote de survie fluide avec indicateurs de danger et de zone sûre.
// @author       Vous & AI Assistant
// @match        https://evades.io/
// @match        https://evades.online/
// @match        https://eu.evades.io/
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    console.log("[Autonomous Survival] Script lancé.");

    let isAutopilotEnabled = false;
    let autopilotInterval = null;

    // --- INTERFACE UTILISATEUR ---
    const dashboardElement = document.createElement('div');
    dashboardElement.id = 'epush-addon-dashboard';
    Object.assign(dashboardElement.style, {
        position: 'fixed', top: '50px', right: '10px', backgroundColor: 'rgba(0, 0, 0, 0.75)',
        color: '#34d3eb', padding: '10px 15px', borderRadius: '8px', fontFamily: 'monospace',
        fontSize: '14px', zIndex: '10002', textShadow: '1px 1px 2px black',
        border: '2px solid #ccc', minWidth: '240px', lineHeight: '1.6', pointerEvents: 'auto',
    });
    dashboardElement.innerHTML = `
        <div id="dashboard-info">En attente de E-Push...</div>
        <div id="autopilot-control" style="margin-top: 10px; padding-top: 10px; border-top: 1px solid #34d3eb;">
            <button id="autopilot-toggle" style="width: 100%; padding: 8px; cursor: pointer; background-color: #4CAF50; color: white; border: none; border-radius: 4px; font-weight: bold; pointer-events: none; opacity: 0.5;">
                Activer Survie Auto
            </button>
        </div>
    `;
    document.body.appendChild(dashboardElement);
    const infoDisplay = document.getElementById('dashboard-info');
    const autopilotButton = document.getElementById('autopilot-toggle');

    function updateAutopilotButton() {
        autopilotButton.textContent = isAutopilotEnabled ? 'Désactiver Survie Auto' : 'Activer Survie Auto';
        autopilotButton.style.backgroundColor = isAutopilotEnabled ? '#f44336' : '#4CAF50';
    }

    // --- SYSTÈME DE SURVIE ---
    const survivalSystem = {
        MAX_SPEED: 100,
        // Vecteur de mouvement lissé pour éviter les à-coups
        smoothedMove: { x: 0, y: 0 },
        SMOOTHING_FACTOR: 0.15, // Plus c'est bas, plus le mouvement est fluide. 0.1 - 0.3 est une bonne plage.

        calculateBestMove: (player, allEntities) => {
            if (!player) return { x: 0, y: 0 };

            let totalRepulsionX = 0;
            let totalRepulsionY = 0;
            const playerRadius = player.radius || 15;

            if (allEntities) {
                for (const entity of Object.values(allEntities)) {
                    if (!entity || entity.id === player.id || entity.isHarmless || entity.entityType === 1) {
                        continue;
                    }
                    const vecX = entity.x - player.x;
                    const vecY = entity.y - player.y;
                    const distance = Math.sqrt(vecX * vecX + vecY * vecY);
                    if (distance === 0) continue;
                    const entityRadius = entity.radius || 15;
                    const safetyDistance = playerRadius + entityRadius + 20;

                    if (distance < safetyDistance + 150) {
                        const force = 1 / (distance * distance);
                        totalRepulsionX -= (vecX / distance) * force;
                        totalRepulsionY -= (vecY / distance) * force;
                    }
                }
            }

            const totalRepulsionMagnitude = Math.sqrt(totalRepulsionX**2 + totalRepulsionY**2);
            let targetMove = { x: 5, y: 0 }; // Mouvement anti-AFK par défaut

            if (totalRepulsionMagnitude > 0.001) {
                targetMove = {
                    x: (totalRepulsionX / totalRepulsionMagnitude) * survivalSystem.MAX_SPEED,
                    y: (totalRepulsionY / totalRepulsionMagnitude) * survivalSystem.MAX_SPEED
                };
            }

            // Lissage du mouvement (interpolation linéaire)
            survivalSystem.smoothedMove.x += (targetMove.x - survivalSystem.smoothedMove.x) * survivalSystem.SMOOTHING_FACTOR;
            survivalSystem.smoothedMove.y += (targetMove.y - survivalSystem.smoothedMove.y) * survivalSystem.SMOOTHING_FACTOR;

            return { x: survivalSystem.smoothedMove.x, y: survivalSystem.smoothedMove.y };
        }
    };

    // --- LOGIQUE DE CONTRÔLE ---
    function startAutopilot() {
        if (autopilotInterval) clearInterval(autopilotInterval);
        const modules = window.E_PUSH_MODULES;
        if (modules && modules.network) {
            autopilotInterval = setInterval(() => {
                const player = modules.network.getPlayerState();
                const entities = modules.gameState ? modules.gameState.entities : {};
                if (player && player.id) {
                    const bestMove = survivalSystem.calculateBestMove(player, entities);
                    modules.network.sendMovement(bestMove.x, bestMove.y);
                }
            }, 50);
            console.log("Pilote de survie ACTIVÉ.");
        }
    }

    function stopAutopilot() {
        if (autopilotInterval) clearInterval(autopilotInterval);
        autopilotInterval = null;
        survivalSystem.smoothedMove = { x: 0, y: 0 }; // Réinitialiser le lissage
        const modules = window.E_PUSH_MODULES;
        if (modules && modules.network) {
            modules.network.sendMovement(0, 0);
        }
        console.log("Pilote de survie DÉSACTIVÉ.");
    }

    autopilotButton.addEventListener('click', () => {
        isAutopilotEnabled = !isAutopilotEnabled;
        updateAutopilotButton();
        if (isAutopilotEnabled) {
            startAutopilot();
        } else {
            stopAutopilot();
        }
    });

    // --- PRÉDICTION DE SÉCURITÉ FUTURE ---
    const futurePredictor = {
        lastTimestamp: Date.now(),
        previous: {},
        velocities: {},
        update(entities) {
            const now = Date.now();
            const dt = (now - this.lastTimestamp) / 1000;
            if (dt > 0) {
                const newVel = {};
                for (const [id, e] of Object.entries(entities)) {
                    const prev = this.previous[id];
                    if (prev) {
                        newVel[id] = {
                            x: (e.x - prev.x) / dt,
                            y: (e.y - prev.y) / dt
                        };
                    } else {
                        newVel[id] = { x: 0, y: 0 };
                    }
                    this.previous[id] = { x: e.x, y: e.y };
                }
                this.velocities = newVel;
                for (const id of Object.keys(this.previous)) {
                    if (!entities[id]) delete this.previous[id];
                }
                this.lastTimestamp = now;
            }
        },
        willBeSafe(player, entities, seconds) {
            const px = player.x;
            const py = player.y;
            const pr = player.radius || 15;
            for (const [id, e] of Object.entries(entities)) {
                if (!e || e.id === player.id || e.isHarmless || e.entityType === 1) continue;
                const vel = this.velocities[id] || { x: 0, y: 0 };
                const ex = e.x + vel.x * seconds;
                const ey = e.y + vel.y * seconds;
                const er = e.radius || 15;
                const dx = ex - px;
                const dy = ey - py;
                if (dx * dx + dy * dy < (pr + er + 5) ** 2) return false;
            }
            return true;
        }
    };

    // --- BOUCLE D'AFFICHAGE ---
    function updateDisplayLoop() {
        requestAnimationFrame(updateDisplayLoop);

        const modules = window.E_PUSH_MODULES;
        if (!modules || !modules.network) return;

        const playerState = modules.network.getPlayerState();
        const entities = modules.gameState ? modules.gameState.entities || {} : {};
        futurePredictor.update(entities);

        if (playerState && playerState.id) {
            const area = modules.gameState ? modules.gameState.area : null;
            let safeZoneStatus = "N/A", safeZoneColor = "#ccc";
            if (area && area.zones) {
                const safeZones = area.zones.filter(zone => zone.type === 1);
                let isInSafeZone = false;
                for (const zone of safeZones) {
                    if (playerState.x >= zone.x && playerState.x <= zone.x + zone.width &&
                        playerState.y >= zone.y && playerState.y <= zone.y + zone.height) {
                        isInSafeZone = true;
                        break;
                    }
                }
                safeZoneStatus = isInSafeZone ? "DANS" : "HORS";
                safeZoneColor = isInSafeZone ? '#00FF7F' : '#FF4500';
            }

            let dangerStatus = "Non", isCurrentlyInDanger = false;
            if (modules.gameState && modules.gameState.entities) {
                const playerRadius = playerState.radius || 15;
                for (const entity of Object.values(modules.gameState.entities)) {
                    if (!entity || entity.id === playerState.id || entity.isHarmless || entity.entityType === 1) continue;
                    const entityRadius = entity.radius || 15;
                    if (((entity.x - playerState.x)**2 + (entity.y - playerState.y)**2) < (playerRadius + entityRadius + 5)**2) {
                        isCurrentlyInDanger = true;
                        dangerStatus = "Oui";
                        break;
                    }
                }
            }
            const dangerColor = isCurrentlyInDanger ? '#FF4136' : '#34d3eb';

            const safeIn1 = modules.gameState && modules.gameState.entities ? futurePredictor.willBeSafe(playerState, modules.gameState.entities, 1) : true;
            const safeIn2 = modules.gameState && modules.gameState.entities ? futurePredictor.willBeSafe(playerState, modules.gameState.entities, 2) : true;
            const safe1Color = safeIn1 ? '#00FF7F' : '#FF4500';
            const safe2Color = safeIn2 ? '#00FF7F' : '#FF4500';

            infoDisplay.innerHTML = `
                <div style="font-weight: bold;">${playerState.heroName || "N/A"} - Lvl ${playerState.level || "?"}</div>
                <div>Position: ${playerState.x.toFixed(0)}, ${playerState.y.toFixed(0)}</div>
                <div style="font-weight: bold; color: ${safeZoneColor};">Zone Sûre: ${safeZoneStatus}</div>
                <div style="font-weight: bold; color: ${dangerColor};">Danger Immédiat: ${dangerStatus}</div>
                <div style="font-weight: bold; color: ${safe1Color};">Sûr dans 1 s: ${safeIn1 ? 'Oui' : 'Non'}</div>
                <div style="font-weight: bold; color: ${safe2Color};">Sûr dans 2 s: ${safeIn2 ? 'Oui' : 'Non'}</div>
            `;
            dashboardElement.style.borderColor = isCurrentlyInDanger ? dangerColor : safeZoneColor;
        } else {
            infoDisplay.innerHTML = "Statut: Hors Jeu";
            dashboardElement.style.borderColor = '#ccc';
        }
    }

    // --- INITIALISATION ---
    const checkInterval = setInterval(() => {
        if (window.E_PUSH_MODULES && window.E_PUSH_MODULES.network) {
            clearInterval(checkInterval);
            autopilotButton.style.pointerEvents = 'auto';
            autopilotButton.style.opacity = '1';
            updateDisplayLoop();
            console.log("Add-on de survie prêt.");
        }
    }, 500);

})();