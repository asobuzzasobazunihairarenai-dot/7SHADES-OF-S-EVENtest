/**
 * 7 SHADES OF S:EVEN - Core Logic
 * 【共通定義】
 * - 到達: 表向きカードの上に駒が置かれた瞬間
 * - 到達効果: 到達時に発動。原則「効果解決」→「カード獲得」の順。
 * - 例外: カードに処遇（場に残る、破棄等）が書かれている場合はそれに従う。
 */
/**
 * 2026/02/07 01:25 修正
 * 1. renderStatus において、スロットが空になった際に背景画像をクリアする処理を追加。
 * （カラフルホール等でカードが奪われた際、背景が残る不具合の修正）
 * 2. 以前の修正（handleHandClick の引数ミス修正）を維持。
 */

function injectGuardLayer(parent) {
    if (!parent) return null;
    let guard = parent.querySelector('.card-guard');
    if (!guard) {
        guard = document.createElement('div');
        guard.className = 'card-guard';
        // pointer-events を auto にしつつ、クリックイベントを親に逃がす設定
        guard.style.position = 'absolute';
        guard.style.inset = '0';
        guard.style.zIndex = '90';
        parent.appendChild(guard);
        
        // 【重要】ガード層をクリックした時、親要素（カード全体）のクリックイベントを発火させる
        guard.addEventListener('click', (e) => {
            // ダブルタップ判定（attachHoverEvents側）を邪魔しない程度に親へ流す
            parent.click();
        });
    }
    return guard;
}

let lastTapTime = 0;
let clickTimer = null;
let touchStartX = 0;
let touchStartY = 0;
let isScrolling = false; // スクロール中フラグ

function attachHoverEvents(el, card, isForceMobile = false) {
    if(!el || !card) return;
    
    const guard = injectGuardLayer(el);
    const target = guard || el;

    target.oncontextmenu = (e) => { e.preventDefault(); return false; };

    // 既存の onclick は el.onclick で設定されているため、それを一度無効化して制御下に置きます
    const originalOnClick = el.onclick;
    el.onclick = null;

    const handleAction = (e) => {
        if (isScrolling) return;

        const currentTime = new Date().getTime();
        const tapLength = currentTime - lastTapTime;

        if (tapLength < 300 && tapLength > 0) {
            // ダブルタップ時：拡大プレビューを表示
            clearTimeout(clickTimer);
            clickTimer = null;
            showHoverPreview(null, card, isForceMobile);
            lastTapTime = 0;
        } else {
            lastTapTime = currentTime;
            clearTimeout(clickTimer);
            // シングルタップ時：300ms待ってから元のクリック処理（確認モーダル表示）を実行
            clickTimer = setTimeout(() => {
                if (originalOnClick && !isScrolling) {
                    // ここで元の onclick (handleHandClick等) を呼び出す
                    originalOnClick.call(el, e);
                }
                clickTimer = null;
            }, 300);
        }
    };

    target.addEventListener('touchstart', (e) => {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        isScrolling = false;
    }, { passive: true });

    target.addEventListener('touchmove', (e) => {
        const moveX = Math.abs(e.touches[0].clientX - touchStartX);
        const moveY = Math.abs(e.touches[0].clientY - touchStartY);
        if (moveX > 10 || moveY > 10) {
            isScrolling = true;
            clearTimeout(clickTimer);
        }
    }, { passive: true });

    target.addEventListener('pointerdown', (e) => {
        if (e.pointerType !== 'mouse') {
            handleAction(e);
        } else {
            if (e.button === 0 && originalOnClick) {
                originalOnClick.call(el, e);
            }
        }
    });

    target.addEventListener('mouseenter', (e) => {
        if (e.pointerType === 'mouse') showHoverPreview(e, card);
    });
    target.addEventListener('mousemove', (e) => {
        if (e.pointerType === 'mouse') updatePreviewPosition(e);
    });
    target.addEventListener('mouseleave', (e) => {
        if (e.pointerType === 'mouse') hideHoverPreview();
    });
}

// --- showHoverPreview も修正（引数追加に対応） ---
function showHoverPreview(e, card, isForceMobile = false) {
    if(!card || hoverTemporarilyDisabled) return;
    const preview = document.getElementById('hover-preview'), 
          previewBox = document.getElementById('hover-preview-box'),
          charEl = document.getElementById('hover-char'), 
          nameEl = document.getElementById('hover-name'),
          closeBtn = document.getElementById('close-preview-btn');
    
    if(!preview || !previewBox || !closeBtn) return;

    // 前の情報を完全にクリア
    previewBox.style.backgroundImage = 'none';
    previewBox.style.backgroundColor = '#111827'; // 暗い色で塗りつぶし
    charEl.textContent = ""; 
    nameEl.textContent = "";
    nameEl.classList.add('hidden');

    const imgPath = card.image || (card.id ? `images/card_${card.id}.webp` : null);
    if (imgPath) {
        previewBox.style.backgroundImage = `url('${imgPath}')`;
        previewBox.style.backgroundSize = 'cover';
        previewBox.style.backgroundPosition = 'center';
    } else {
        charEl.textContent = card.name ? card.name[0] : '?';
        nameEl.textContent = card.name || "";
        nameEl.classList.remove('hidden');
    }

    preview.classList.remove('hidden');

    // PCかスマホかの判定（isForceMobile が true の場合は強制的にスマホ表示）
    const isMouse = (e !== null && !window.matchMedia('(pointer: coarse)').matches && !isForceMobile);

    if (isMouse) {
        preview.classList.add('pointer-events-none'); 
        closeBtn.classList.add('hidden');
        updatePreviewPosition(e);
    } else {
        preview.classList.remove('pointer-events-none');
        previewBox.style.left = '50%';
        previewBox.style.top = '50%';
        previewBox.style.transform = 'translate(-50%, -50%) scale(1.1)';
        closeBtn.classList.remove('hidden');
        closeBtn.classList.add('animate-slide-up');
    }
}

// 新設：プレビューをマウス位置の横にずらして表示する
function updatePreviewPosition(e) {
    const previewBox = document.getElementById('hover-preview-box');
    if (!previewBox) return;
    let x = e.clientX + 20; 
    let y = e.clientY + 20;
    if (x + 280 > window.innerWidth) x = e.clientX - 300; 
    if (y + 280 > window.innerHeight) y = e.clientY - 300;
    previewBox.style.left = `${x}px`;
    previewBox.style.top = `${y}px`;
    previewBox.style.transform = 'none';
}

function hideHoverPreview(fromTap = false) { 
    const el = document.getElementById('hover-preview');
    if(!el) return;

    el.classList.add('hidden'); 
    isLongPressActive = false; 

    // 重要：閉じた瞬間に「今閉じたばかり」というフラグを立てる
    hoverTemporarilyDisabled = true;
    setTimeout(() => { 
        hoverTemporarilyDisabled = false; 
    }, 500); // 0.5秒間は再表示を禁止して混線を防ぐ
}

function generateUI() {
    ['area-p1', 'area-p2', 'area-p3', 'area-p4'].forEach(id => { const el = document.getElementById(id); if(el) el.innerHTML = ''; });
    if(!players) return;
    let posMapping = (players.length === 2) ? ['area-p3', 'area-p1'] : (players.length === 3) ? ['area-p3', 'area-p4', 'area-p1'] : ['area-p3', 'area-p4', 'area-p1', 'area-p2'];
    
    players.forEach((p, idx) => {
        const targetId = posMapping[idx], container = document.getElementById(targetId); if(!container) return;
        const isVertical = (targetId === 'area-p2' || targetId === 'area-p4');
        const flexDir = isVertical ? 'flex-col' : 'flex-row';

        // 修正箇所：位置に合わせて色の並び順を決定する
        // 各プレイヤーから見て「右側が赤」になる順序に配列を調整
        let displayOrder = [...LOCK_ORDER]; // デフォルトは紫->赤
        
        if (targetId === 'area-p3') {
            // 下（自分）：右側を赤にするため、左から「紫〜赤」の順（LOCK_ORDERそのまま）
            displayOrder = [...LOCK_ORDER];
        } else if (targetId === 'area-p1') {
            // 上：180度回転しているため、左から「赤〜紫」の順
            displayOrder = [...LOCK_ORDER].reverse();
        } else if (targetId === 'area-p4') {
            // 左：90度右回転しているため、上から「紫〜赤」の順
            displayOrder = [...LOCK_ORDER];
        } else if (targetId === 'area-p2') {
            // 右：90度左回転しているため、上から「赤〜紫」の順
            displayOrder = [...LOCK_ORDER].reverse();
        }

        const div = document.createElement('div'); div.id = `p${p.id}-status`; div.className = `player-area-box p-0.5 rounded border border-gray-700 bg-gray-900/40 flex ${flexDir} items-center justify-center transition-all duration-500 w-full h-full`; div.onclick = () => openPlayerDetailModal(p.id);
        
        // 修正箇所：決定した displayOrder でループ
        let slotsHTML = ''; 
        displayOrder.forEach(color => { 
            slotsHTML += `<div id="p${p.id}-slot-${color.id}" class="mini-slot rounded-sm border border-gray-600 bg-gray-800/60 relative flex items-center justify-center"></div>`; 
        });

        const hCount = (hands[p.id] || []).length;
        // 修正箇所：手札枚数の前にプレイヤーアイコン(icon)を追加
        // 重複を避けるため、名前以外の情報は renderStatus で動的に生成するように変更
        const infoHTML = `
            <div class="flex ${isVertical ? 'flex-col' : 'flex-row'} items-center gap-1 text-[8px] justify-center relative">
                <span class="font-bold text-gray-300">${p.name}</span>
            </div>
            <div id="p${p.id}-rights" class="flex gap-0.5 mt-0.5 items-center justify-center"></div>`;

        if (isVertical) div.innerHTML = `<div class="mb-0.5 text-center w-full">${infoHTML}</div><div class="flex flex-col gap-0 items-center">${slotsHTML}</div>`;
        else div.innerHTML = `<div class="flex gap-1 items-center mb-0.5 w-full justify-center">${infoHTML}</div><div class="flex gap-0 w-full justify-center">${slotsHTML}</div>`;
        container.appendChild(div);
    });
}

function renderBoard() {
    const boardEl = document.getElementById('board-grid');
    if (!boardEl) return;
    boardEl.innerHTML = '';
    if (!players || !players.length || !players[turn]) return;

    // ★修正：プレイヤー配列が空、または現在のプレイヤーが未定義の場合（初期化中）への対策
    const p = (players && players.length > 0 && players[turn]) ? players[turn] : null;

    // --- 修正箇所：条件付き監視ロジック ---
    // 選択モード中でなく、かつ自分が移動処理中でない時のみ、足元の未処理カードをチェック
    if (!selectionState.active && !isProcessingMove) { 
        players.forEach(pObj => {
            if (pObj.x === -1 || pObj.y === -1) return;
            const cell = board[pObj.y][pObj.x];
            
            // カードが存在し、表向きで、かつまだそのプレイヤーがそのカードの効果を処理していない場合
            if (cell && !cell.empty && cell.revealed && pObj.processedArrivalCard !== cell.color) {
                pObj.processedArrivalCard = cell.color;
                
                // 演出が重ならないようわずかに遅延させて実行
                setTimeout(() => {
                    handleArrivalLogic(cell, pObj, null, cell.color, false);
                }, 50);
            }
        });
    }
    // --- 修正箇所ここまで ---
    
    board.forEach((row, y) => {
        row.forEach((cell, x) => {
            const div = document.createElement('div');
            let cls = "cell relative rounded-sm flex items-center justify-center transition-all duration-300 w-full h-full hover-zoom ";
            const owner = players.find(pl => pl.startPos.x === x && pl.startPos.y === y);
            let gateOverlay = '';
            if (owner) {
                const borderColor = owner.color.hex; gateOverlay = `<div class="gate-glow-overlay" style="border: 2px solid ${borderColor}; box-shadow: 0 0 5px ${borderColor};"></div>`;
            }
            
            let cardDisplay = '';
            // ★修正：cell.color が null（配置中）の場合でもエラーにならないようガード
            if (cell && !cell.empty && cell.color) {
                if (cell.revealed) { 
                    const label = cell.color.image ? "" : `<span class="z-10">${cell.color.name[0]}</span>`;
                    cardDisplay = `<div class="w-full h-full border border-white/5 flex items-center justify-center shadow-sm pointer-events-none relative overflow-hidden" style="font-size: 8px; ${cell.color.image ? `background-image: url('${cell.color.image}'); background-size: cover; background-position: center;` : `background-color: ${cell.color.hex};`}">
                        ${label}
                    </div>`; 
                } 
                else {
                    cardDisplay = `<div class="w-full h-full rounded-sm card-back-pattern border border-gray-500/30 flex items-center justify-center pointer-events-none"><span class="text-white opacity-20 text-[8px] font-bold">?</span></div>`;
                }
                const stackCount = (cell.stack || []).filter(c => c).length;
                if(stackCount > 0) cardDisplay += `<div class="stack-badge">+${stackCount}</div>`;
            } else {
                cls += "bg-transparent "; 
            }

            // --- ここで先に移動や選択の onclick を定義 ---
            // ★修正：p が存在する場合のみ各モードの onclick を設定
            if (p && selectionState.active) {
                const isSelectable = isCellSelectable(x, y);
                if (isSelectable) {
                    cls += "selectable "; div.onclick = () => { if(!isLongPressActive) handleSelection(x, y); };
                    if (selectionState.selected.some(s => s.x === x && s.y === y)) {
                        cls += "ring-2 ring-yellow-500 "; 
                        if (selectionState.count > 1) {
                            const selIdx = selectionState.selected.findIndex(s => s.x === x && s.y === y);
                            cardDisplay += `<div class="absolute top-0 left-0 bg-yellow-500 text-black text-[10px] font-bold px-1 z-[60] shadow-sm">${selIdx + 1}</div>`;
                        }
                    }
                } else { cls += "opacity-50 "; }
            } else if (p) {
                const pOnCell = players.find(ep => ep.id !== p.id && ep.x === x && ep.y === y);
                const dist = Math.abs(p.x - x) + Math.abs(p.y - y);
                const isTarget = (p.dimensionActive && !p.baseMoveUsed) ? (dist === 2) : (dist === 1);
                if (isPlacingCard) { if (isTarget && !pOnCell) { cls += "ring-2 ring-green-400 cursor-pointer z-10 "; div.onclick = () => { if(!isLongPressActive) executePlaceCard(x, y); }; } else cls += "opacity-50 "; } 
                else if (!winner && currentPhase === PHASE.MOVE && isTarget && !isStuck && !isProcessingMove) { 
                    const canStep = !cell.empty || pOnCell; 
                    if (canStep) { 
                        let showRing = false;
                        if (pOnCell) { if (!p.konohanaPenalty) { cls += "ring-2 ring-red-500 cursor-pointer z-10 "; showRing = true; } }
                        else { if (!p.marmegoPenalty) { cls += "ring-2 ring-yellow-400 cursor-pointer z-10 "; showRing = true; } }
                        if (showRing) div.onclick = () => { if(!isLongPressActive) handleBoardClick(x, y); };
                    } else cls += "opacity-50 cursor-not-allowed "; 
                } else cls += "opacity-90 ";
            } else {
                cls += "opacity-90 "; // p がいない初期化中
            }

            // --- 1. セルの基本設定 ---
            div.className = cls; 
            div.innerHTML = cardDisplay + gateOverlay; 

            // --- 2. 特殊演出（気まぐれ）の適用 ---
            const whimInfo = richWhimHistory.find(h => h.pos.x === x && h.pos.y === y);
            if (whimInfo) {
                div.classList.add('rich-whim-highlight');
                div.style.setProperty('--player-color', whimInfo.player.color.hex);
                const label = document.createElement('div');
                label.className = 'whim-label';
                label.textContent = whimInfo.player.name;
                div.appendChild(label);
            }

            // --- 3. プレイヤー駒の描画 ---
            const pOnCellMarker = players.find(pl => x === pl.x && y === pl.y && x !== -1); 
            if (pOnCellMarker) { 
                const isActive = p && (turn === players.indexOf(pOnCellMarker)); 
                const pDiv = document.createElement('div'); 
                pDiv.id = `p${pOnCellMarker.id}-marker`; 
                pDiv.className = `w-[85%] h-[85%] player-marker absolute inset-0 m-auto`; 
                
                pDiv.style.zIndex = "1000";

                // 修正箇所：常に pieceImage (piece_00X.png) を使用するよう固定
                const markerImage = pOnCellMarker.pieceImage;

                if (markerImage) {
                    pDiv.style.backgroundImage = `url('${markerImage}')`;
                    pDiv.style.backgroundSize = 'cover';
                    pDiv.style.backgroundPosition = 'center';
                    pDiv.style.backgroundColor = 'transparent';
                    pDiv.style.border = 'none';
                } else {
                    pDiv.className += ` ${pOnCellMarker.css} rounded-sm cube-shadow`;
                }

                if (isActive) {
                    div.classList.add('player-active'); 
                    pDiv.style.setProperty('--player-color-glow', pOnCellMarker.color.hex || '#fff');
                }
                div.appendChild(pDiv); 
            }

            // --- 4. ホバーイベントの登録（ご質問の箇所：ここに残します） ---
            if (cell && !cell.empty && cell.color && cell.revealed) {
                attachHoverEvents(div, cell.color, true);
            }

            // --- 5. セルを盤面に追加 ---
            boardEl.appendChild(div);
        });
    });
}

function renderHand() {
    const handEl = document.getElementById('current-hand');
    const handCountEl = document.getElementById('hand-count');
    
    // --- 修正箇所：ここから ---
    const displayTurn = (typeof isP1HandOnlyView !== 'undefined' && isP1HandOnlyView) ? 0 : turn;
    if (!handEl || !players || !players[displayTurn]) return;
    const p = players[displayTurn];
    // --- 修正箇所：ここまで ---

    const pHand = hands[p.id] || [];
    
    if (handCountEl) handCountEl.textContent = `${pHand.length}枚`;
    handEl.innerHTML = '';

    // ステータスエリアの枚数更新
    players.forEach(player => {
        const countSpan = document.getElementById(`p${player.id}-hand-count`);
        if (countSpan) countSpan.textContent = (hands[player.id] || []).length;
    });

    pHand.forEach((card, index) => {
        const cardDiv = document.createElement('div');
        const isSelected = (activeHandCard === card);
        
        let canPlay = true;

        // 修正箇所：カード自体が封印(sealed)されている場合は、フェイズに関わらず使用不可
        if (card.sealed) {
            canPlay = false;
        } else if (currentPhase === PHASE.HAND) {
            canPlay = typeof canPlayHandEffect === 'function' ? canPlayHandEffect(card, p) : true;
        } else if (currentPhase === PHASE.LOCK) {
            const isSpecialColor = ['white', 'black', 'rainbow'].includes(card.colorId);
            const slotCards = collections[p.id] ? collections[p.id][card.colorId] : [];
            const hasCurse = slotCards.some(c => c.id === 34);
            const isAlreadyLocked = !isSpecialColor && slotCards.length > 0 && !(hasCurse && slotCards.length < 3);

            if (card.type === "ETERNAL" || isSpecialColor || isAlreadyLocked) {
                canPlay = false;
            }
        }

        let txtCls = card.colorId === 'white' ? 'text-gray-800' : (card.colorId === 'black' ? 'text-gray-200' : 'text-white');
        let faceClass = card.type === "ETERNAL" ? "eternal-card-face" : card.bg;
        
        // 修正箇所：既存のクラス判定に card.fromViridian のチェックを追加
        cardDiv.className = `hand-card w-16 h-16 rounded border-2 border-white ${faceClass} flex flex-col items-center justify-center shadow-lg cursor-pointer transition-all hover:-translate-y-1 relative overflow-hidden shrink-0 ${isSelected ? 'ring-4 ring-yellow-400 -translate-y-2' : ''} ${!canPlay ? 'card-dimmed opacity-60 grayscale cursor-not-allowed' : ''} ${card.fromViridian ? 'viridian-temp-card' : ''}`;
        
        const imgPath = card.image || (card.id ? `images/card_${card.id}.webp` : null);
        if (imgPath) {
            cardDiv.style.backgroundImage = `url('${imgPath}')`;
            cardDiv.style.backgroundSize = 'cover';
            cardDiv.style.backgroundPosition = 'center';
            cardDiv.innerHTML = ""; 
        } else {
            cardDiv.innerHTML = `<span class="font-bold text-lg ${txtCls} z-10">${card.name ? card.name[0] : '?'}</span><span class="text-[6px] ${txtCls} z-10 bg-black/20 w-full text-center">${card.name || ""}</span>`;
        }

        if (card.sealed) {
            const seal = document.createElement('div');
            seal.className = "absolute inset-0 bg-black/40 flex items-center justify-center z-20";
            seal.innerHTML = '<span class="text-white text-[8px] font-bold border border-white px-1 rotate-12">SEALED</span>';
            cardDiv.appendChild(seal);
        }

        if (canPlay) {
            cardDiv.onclick = () => {
                // 【修正】isHandEffectProcessing が true なら、何もしない（クリックを無視）
                if (isPeekingMode || isLongPressActive || isHandEffectProcessing) return;
                handleHandClick(index); 
            };
        } else {
            cardDiv.onclick = (e) => {
                e.stopPropagation();
                // 修正箇所：封印時のメッセージを追加
                if (card.sealed) {
                    if (typeof showToast === 'function') showToast("このカードは封印されており、今ターンは使えません");
                } else if (currentPhase === PHASE.LOCK) {
                    if (typeof showToast === 'function') showToast("ロックできないカードです");
                } else if (typeof showToast === 'function') showToast("使用条件を満たしていません");
            };
        }
        if (typeof attachHoverEvents === 'function') attachHoverEvents(cardDiv, card);
        handEl.appendChild(cardDiv);
    });
}

function renderStatus() { 
    if(!players) return;
    players.forEach(p => { 
        const container = document.getElementById(`p${p.id}-status`), isMyTurn = (turn === players.indexOf(p)); 
        const isHuman = (p.id === 1); 

        if (container) {
            if (isMyTurn) container.classList.add("player-active-box"); else container.classList.remove("player-active-box"); 
        }
        
        const rightsEl = document.getElementById(`p${p.id}-rights`);
        if (rightsEl) {
            rightsEl.innerHTML = '';
            rightsEl.className = "flex items-center gap-1 mt-0.5"; // レイアウト調整用クラス

            // 1. プロフィール画像の追加
            const profImg = document.createElement('img');
            const iconPath = p.icon || `images/character_00${p.id + 1}.webp`;
            profImg.src = iconPath;
            profImg.className = "w-6 h-6 rounded-full border border-gray-500 shadow-sm object-cover";
            rightsEl.appendChild(profImg);

            // 2. 手札枚数の追加
            const handInfo = document.createElement('div');
            handInfo.className = "flex items-center text-[10px] font-bold text-gray-300 mr-1";
            const handCount = hands[p.id] ? hands[p.id].length : 0;
            handInfo.innerHTML = `
             <div class="w-4 h-4 mr-1 border border-gray-500 rounded-[2px] overflow-hidden shadow-sm opacity-80" 
             style="background-image: url('images/normal_card_back.webp'); background-size: cover; background-position: center;">
             </div>
             ${handCount}
             `;
            rightsEl.appendChild(handInfo);

            // 3. 既存の追加移動権利（ダッシュアイコン）の表示（既存ロジックを維持）
            if (p.extraMoves > 0) {
                const dashIcon = document.createElement('div');
                dashIcon.className = "rounded-sm border border-white relative overflow-hidden bg-red-500 cursor-pointer hover:scale-110 transition-transform shadow-sm flex-shrink-0";
                dashIcon.style.width = "1.1rem"; dashIcon.style.height = "1.1rem"; dashIcon.style.pointerEvents = "auto"; 
                dashIcon.style.backgroundImage = `url('images/card_15.webp')`; dashIcon.style.backgroundSize = "cover"; dashIcon.style.backgroundPosition = "center";
                
                const badge = document.createElement('div');
                badge.className = "absolute -bottom-0.5 -right-0.5 bg-black/80 text-white text-[5px] px-0.5 rounded-tl-sm border border-white/20 font-bold z-10";
                badge.textContent = `x${p.extraMoves}`; 
                dashIcon.appendChild(badge);
                
                dashIcon.onclick = (e) => { 
                    e.stopPropagation(); 
                    if (typeof showToast === 'function') showToast(`追加移動権利が ${p.extraMoves} 回あります`); 
                };
                rightsEl.appendChild(dashIcon);
            }
        }

        LOCK_ORDER.forEach(color => { 
            const slotEl = document.getElementById(`p${p.id}-slot-${color.id}`); if(!slotEl) return; 
            const slotCards = collections[p.id] ? collections[p.id][color.id] : []; slotEl.innerHTML = ''; 
            slotEl.style.pointerEvents = "auto"; 
            slotEl.style.position = "relative"; 

            if (slotCards && slotCards.length > 0) { 
                const topC = slotCards[slotCards.length - 1];
                let txtCls = topC.colorId === 'white' ? 'text-gray-800' : (topC.colorId === 'black' ? 'text-gray-200' : 'text-white');
                slotEl.className = `mini-slot rounded-sm border border-white relative ${topC.bg}`; 
                if (topC.image) {
                    slotEl.style.backgroundImage = `url('${topC.image}')`;
                    slotEl.style.backgroundSize = 'cover';
                    slotEl.innerHTML = ""; 
                } else {
                    slotEl.innerHTML = `<span class="font-bold ${txtCls} z-10" style="font-size: 6px;">${topC.name[0]}</span>`;
                }
                if (slotCards.length > 1) { 
                    const numBadge = document.createElement('div'); 
                    numBadge.className = "absolute -bottom-1 -right-1 bg-black/80 text-yellow-400 text-[4px] px-0.5 rounded-tl-sm font-bold border-[0.3px] border-yellow-500 z-20"; 
                    numBadge.textContent = slotCards.length; 
                    slotEl.appendChild(numBadge); 
                }
                slotEl.style.opacity = "1"; 

                if (isMyTurn && isHuman) {
                    const isExpanded = (expandedLockColor === color.id);
                    slotEl.onclick = (e) => {
                        e.stopPropagation();
                        hideHoverPreview(true);
                        if (slotCards.length === 1 && currentPhase === PHASE.HAND && (topC.type === "FIRST" || topC.type === "ETERNAL")) {
                            handleHandClick(-1, topC);
                        } else if (slotCards.length > 0) {
                            expandedLockColor = isExpanded ? null : color.id;
                            renderStatus(); 
                        }
                    };

                    if (isExpanded) {
                        slotEl.style.zIndex = "1000";
                        const popup = document.createElement('div');
                        popup.className = "absolute left-0 top-full mt-1 flex flex-col gap-1 z-[2000] bg-black/90 p-1 rounded border border-yellow-500 shadow-2xl animate-fade-in-down";
                        popup.style.width = "2.6rem"; 

                        slotCards.forEach((card) => {
                            const pCard = document.createElement('div');
                            let pTxtCls = card.colorId === 'white' ? 'text-gray-800' : (card.colorId === 'black' ? 'text-gray-200' : 'text-white');
                            pCard.className = `w-8 h-8 rounded-sm border border-white/50 flex items-center justify-center cursor-pointer hover:scale-110 transition-transform overflow-hidden shrink-0 ${card.bg}`;
                            if (card.image) {
                                pCard.style.backgroundImage = `url('${card.image}')`;
                                pCard.style.backgroundSize = "cover";
                                pCard.style.backgroundPosition = "center";
                            } else {
                                pCard.innerHTML = `<span class="font-bold ${pTxtCls}" style="font-size: 8px;">${card.name[0]}</span>`;
                            }
                            
                            pCard.onclick = (ev) => {
                                ev.stopPropagation();
                                hideHoverPreview(true);
                                if (currentPhase === PHASE.HAND && (card.type === "FIRST" || card.type === "ETERNAL")) {
                                    handleHandClick(-1, card);
                                }
                                expandedLockColor = null;
                                renderStatus();
                            };
                            attachHoverEvents(pCard, card);
                            popup.appendChild(pCard);
                        });
                        slotEl.appendChild(popup);
                        slotEl.classList.add('ring-2', 'ring-yellow-500');
                    } else {
                        slotEl.style.zIndex = "";
                        slotEl.classList.remove('ring-2', 'ring-yellow-500');
                    }
                } else {
                    slotEl.onclick = (e) => { e.stopPropagation(); openPlayerDetailModal(p.id); };
                }
            } else { 
                // スロットが空の場合
                slotEl.style.opacity = "0.5"; 
                slotEl.style.borderColor = color.hex; 
                slotEl.classList.add("border-b-2"); 
                slotEl.style.backgroundImage = 'none'; // 追加：背景画像をクリア
                slotEl.className = `mini-slot rounded-sm border border-gray-600 bg-gray-800 relative flex items-center justify-center`;
                slotEl.onclick = (e) => { e.stopPropagation(); if(!isHuman) openPlayerDetailModal(p.id); };
            } 
        }); 
    }); 

    const oldLockArea = document.getElementById('my-lock-container');
    if (oldLockArea) oldLockArea.classList.add('hidden', 'pointer-events-none');
}

function renderMyLockArea() { 
    if(!players || !players[turn]) return;
    const p = players[turn];
    const buffContainer = document.getElementById('player-buffs'); 
    if(!buffContainer) return;
    buffContainer.innerHTML = '';

    if (p.extraMoves > 0) {
        const extraMoveBadge = document.createElement('div');
        extraMoveBadge.className = "px-2 py-0.5 bg-red-600 text-white text-[10px] rounded-full animate-bounce font-black border border-white shadow-lg flex items-center gap-1 shrink-0";
        extraMoveBadge.innerHTML = `👟 追加移動権利x${p.extraMoves}`;
        buffContainer.appendChild(extraMoveBadge);
    }
}

function renderDeckAndDiscard() { 
    const ec = document.getElementById('eternal-count');
    const dc = document.getElementById('deck-count');
    
    const eLen = (typeof eternalDeck !== 'undefined') ? eternalDeck.length : 0;
    const dLen = (typeof deck !== 'undefined') ? deck.length : 0;
    const pLen = (typeof discardPile !== 'undefined') ? discardPile.length : 0;

    const countStyle = (el) => {
        if(!el) return;
        el.style.color = "black";
        el.style.textShadow = "1px 1px 0px #fff, -1px -1px 0px #fff, 1px -1px 0px #fff, -1px 1px 0px #fff, 0px 1px 0px #fff, 0px -1px 0px #fff, 1px 0px 0px #fff, -1px 0px 0px #fff";
        el.style.zIndex = "30";
        el.style.position = "relative";
    };

    if(ec) { ec.textContent = eLen; countStyle(ec); }
    if(dc) { dc.textContent = dLen; countStyle(dc); }

    const discardView = document.getElementById('discard-view');
    if (!discardView) return; 
    
    discardView.innerHTML = ''; 
    const countLabel = document.createElement('span');
    countLabel.className = "text-[10px] font-bold z-20 pointer-events-none";
    countLabel.textContent = pLen;
    countStyle(countLabel);

    if (discardPile && discardPile.length > 0) { 
        const topCard = discardPile[discardPile.length - 1];
        const cardEl = document.createElement('div'); 
        // 修正ポイント: inset-0 ではなく w-full h-full を使い、親の flex 等に干渉させない
        cardEl.className = `w-full h-full rounded border border-white flex items-center justify-center shadow-md cursor-pointer overflow-hidden relative ${topCard.bg}`; 
        
        const imgPath = topCard.image || (topCard.id ? `images/card_${topCard.id}.webp` : null);
        if (imgPath) {
            cardEl.style.backgroundImage = `url('${imgPath}')`; 
            cardEl.style.backgroundSize = 'cover'; 
            cardEl.style.backgroundPosition = 'center';
            cardEl.innerHTML = ""; 
        } else {
            let txtCls = topCard.colorId === 'white' ? 'text-gray-800' : (topCard.colorId === 'black' ? 'text-gray-200' : 'text-white');
            cardEl.innerHTML = `<span class="font-bold text-[8px] ${txtCls} z-10">${topCard.name[0]}</span>`;
        }
        discardView.appendChild(cardEl); 
        if (typeof attachHoverEvents === 'function') attachHoverEvents(cardEl, topCard);
        
        // 枚数ラベルを最後に重ねる
        countLabel.style.position = "absolute";
        discardView.appendChild(countLabel);
    } else {
        const emptyLabel = document.createElement('span');
        emptyLabel.className = "text-[8px] text-gray-600 z-10";
        emptyLabel.textContent = "空";
        discardView.appendChild(emptyLabel);
        discardView.appendChild(countLabel);
    }
}

function updatePhaseIndicator() { 
    if(!players || !players[turn]) return;
    const p = players[turn], textEl = document.getElementById('instruction-text'), skipBtn = document.getElementById('skip-btn'), stuckBtn = document.getElementById('stuck-btn'); 
    const actionsContainer = document.getElementById('floating-actions'), rxBtn = document.getElementById('reaction-skip-btn');
    if(!textEl) return;

    document.querySelectorAll('.phase-step').forEach(el => el.classList.remove('active', 'passed')); 
    if (currentPhase === PHASE.LOCK) document.getElementById('phase-lock').classList.add('active'); 
    else if (currentPhase === PHASE.HAND) { document.getElementById('phase-lock').classList.add('passed'); document.getElementById('phase-hand').classList.add('active'); } 
    else if (currentPhase === PHASE.MOVE) { document.getElementById('phase-lock').classList.add('passed'); document.getElementById('phase-hand').classList.add('passed'); document.getElementById('phase-move').classList.add('active'); } 
    
    if(actionsContainer) actionsContainer.classList.remove('hidden');
    if(skipBtn) skipBtn.classList.toggle('hidden', selectionState.active || currentPhase === PHASE.MOVE); 
    if(skipBtn && currentPhase !== PHASE.MOVE) skipBtn.textContent = currentPhase === PHASE.LOCK ? "ロックしない" : "ムーブへ"; 
    if(stuckBtn) stuckBtn.classList.toggle('hidden', selectionState.active || !(currentPhase === PHASE.MOVE && isStuck && !isPlacingCard && !p.baseMoveUsed)); 
    
    const anyAnytimeCard = players.some(pl => hands[pl.id] && hands[pl.id].some(c => c.handEffect?.anytime));
    if (rxBtn) {
        if (anyAnytimeCard && !selectionState.active) { rxBtn.classList.remove('hidden'); rxBtn.textContent = `反応スルー: ${p.reactionSkip ? 'ON' : 'OFF'}`; } else { rxBtn.classList.add('hidden'); }
    }
    
    if (winner) textEl.textContent = "勝者決定"; else if (isPlacingCard) textEl.textContent = "配置：場所タップ"; 
    else if (selectionState.active) textEl.innerHTML = `<span class=\"text-yellow-400 font-bold animate-pulse\">${selectionState.prompt}</span>`; 
    else if (p.extraMoves > 0 && currentPhase === PHASE.MOVE && p.baseMoveUsed) textEl.innerHTML = `<span class=\"text-red-400 font-bold animate-pulse\">追加移動権利：場所タップ</span>`;
    else textEl.innerHTML = `<span class=\"${p.color.bg.replace('bg-', 'text-')}\">${p.name}</span>: ${currentPhase === PHASE.LOCK ? 'ロック可' : currentPhase === PHASE.HAND ? '手札使用' : '移動'}`;
}

function updateTimerVisual() { 
    const bar = document.getElementById('timer-bar');
    const textEl = document.getElementById('instruction-text');
    const timerText = document.getElementById('timer-text'); // ★追加
    if(!bar || !players[turn]) return;

    const p = players[turn];
    const totalCurrent = useGlobalTimer ? (timeLeft + p.totalTimeLeft) : timeLeft;
    const maxPossible = useGlobalTimer ? (currentPhaseMaxTime + 180) : currentPhaseMaxTime;
    
    // バーの更新（100%を超えないよう安全策）
    const pct = Math.min(100, (totalCurrent / maxPossible) * 100);
    bar.style.width = `${pct}%`; 

    // --- バーの色をプレイヤーの色に変更 ---
    const playerBgClass = p.color.bg; 
    bar.className = `h-full w-full transition-all duration-1000 ease-linear ${playerBgClass}`; 

    // ★追加：タイマーバーの下の小さな数字（確認用）
    if (timerText) {
        timerText.textContent = `${totalCurrent.toFixed(1)}s`;
        // 通常モードで15秒を超えていたら赤字にする（デバッグ用）
        if (!useGlobalTimer && timeLeft > (window.PHASE_TIME_SEC || 15)) {
            timerText.classList.add('text-red-500');
        } else {
            timerText.classList.remove('text-red-500');
        }
    }

    // 既存：指示テキスト横の分：秒表示（全体時間制がONの時のみ）
    if (useGlobalTimer && textEl) {
        const minutes = Math.floor(p.totalTimeLeft / 60);
        const seconds = p.totalTimeLeft % 60;
        const timeStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        const baseText = textEl.innerHTML.split(' | ')[0];
        textEl.innerHTML = `${baseText} | <span class="text-blue-400">⏳${timeStr}</span>`;
    }
}