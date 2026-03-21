/**
 * 7 SHADES OF S:EVEN - game_ui_render.js
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
        
        guard.addEventListener('click', (e) => {
            // シングルクリックはそのまま親に流す（遅延なしで快適に動作）
            parent.click();
        });

        // 右クリックでカード拡大表示
        guard.addEventListener('contextmenu', (e) => {
            e.preventDefault(); // ブラウザ標準の右クリックメニューを禁止
            e.stopPropagation();

            const cardData = parent.__cardData;
            if (cardData && typeof showCardModal === 'function') {
                showCardModal(cardData);
            }
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

    // 右クリック（コンテキストメニュー）で拡大表示を実行
    target.oncontextmenu = (e) => { 
        e.preventDefault(); 
        e.stopPropagation();
        // スマホのダブルタップ時と同じ「拡大プレビュー」を呼び出します
        // 第3引数に true を渡すことで、マウスでも「スマホ風の拡大固定表示」を行います
        if (typeof showHoverPreview === 'function') {
            showHoverPreview(null, card, true);
        }
        return false; 
    };

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
/**
 * 2026/02/28 修正
 * 閉じるボタンが反応しない問題を解決するため、ボタンに直接クリックイベントを再設定。
 */
function showHoverPreview(e, card, isForceMobile = false) {
    if(!card || hoverTemporarilyDisabled) return;
    const preview = document.getElementById('hover-preview'), 
          previewBox = document.getElementById('hover-preview-box'),
          charEl = document.getElementById('hover-char'), 
          nameEl = document.getElementById('hover-name'),
          descEl = document.getElementById('hover-description'); // ★これを追加
    
    if(!preview || !previewBox) return;

    // 【外科手術的追加】z-indexを最大級に設定し、設定モーダルの上に被せる
    preview.style.zIndex = "100000";

    // --- 【外科手術】既存のボタンを完全に削除して作り直す ---
    let oldBtn = document.getElementById('close-preview-btn');
    if (oldBtn) oldBtn.remove();

    const closeBtn = document.createElement('div');
    closeBtn.id = 'close-preview-btn';
    // 丸の中にバツ印のデザイン
    closeBtn.innerHTML = '×';
    
    // ボタンのスタイル（丸型・バツ印）
    Object.assign(closeBtn.style, {
        position: 'absolute',
        bottom: '30px',
        left: '50%',
        transform: 'translateX(-50%)',
        width: '60px',
        height: '60px',
        backgroundColor: '#ef4444', // 赤色
        color: 'white',
        fontSize: '32px',
        fontWeight: 'bold',
        display: 'none', // 初期は非表示
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: '50%', // 正円
        border: '3px solid white',
        boxShadow: '0 4px 15px rgba(0,0,0,0.5)',
        cursor: 'pointer',
        zIndex: '20000',
        pointerEvents: 'auto'
    });

    // クリックイベントを確実に登録
    closeBtn.onclick = (event) => {
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }
        // コンソールログで動作確認ができるようにします（不要なら消してください）
        console.log("Close button clicked");
        
        // 全身全霊で閉じる
        hideHoverPreview(true);
        
        // 念押し：親要素を物理的に隠す
        preview.classList.add('hidden');
        preview.style.display = 'none';
        return false;
    };

    // z-index をさらに引き上げ（ブラウザのいかなる要素よりも前へ）
    closeBtn.style.zIndex = "99999";

    preview.appendChild(closeBtn);

    preview.appendChild(closeBtn);
    // --------------------------------------------------

    // 親要素のレイアウト設定
    preview.style.display = "flex";
    preview.style.flexDirection = "column";
    preview.style.alignItems = "center";
    preview.style.justifyContent = "center";

    // 情報クリアと画像設定
    previewBox.style.backgroundImage = 'none';
    previewBox.style.backgroundColor = '#111827'; 
    
    charEl.textContent = ""; 
    nameEl.textContent = "";
    if (descEl) descEl.innerHTML = ""; // 一旦空にする

    // ★追加：補足説明を表示する処理
    if (descEl) {
        if (card.description) {
            descEl.classList.remove('hidden');
            // 改行コード(\n)をHTMLの改行(<br>)に変換して表示
            descEl.innerHTML = card.description.replace(/\n/g, '<br>');
        } else {
            descEl.classList.add('hidden');
        }
    }
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

    const isMouse = (e !== null && !window.matchMedia('(pointer: coarse)').matches && !isForceMobile);

    if (isMouse) {
        preview.classList.add('pointer-events-none'); 
        preview.style.pointerEvents = "none";
        closeBtn.style.display = 'none';
        updatePreviewPosition(e);
    } else {
        // 右クリック拡大またはスマホ時のみ表示・有効化
        preview.classList.remove('pointer-events-none');
        preview.style.pointerEvents = "auto";
        
        previewBox.style.left = '50%';
        previewBox.style.top = '50%';
        previewBox.style.transform = 'translate(-50%, -50%) scale(1.0)';
        
        closeBtn.style.display = 'flex'; // ここで表示
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

    // クラスだけでなく、style属性で物理的に消去
    el.classList.add('hidden'); 
    el.style.display = 'none'; 
    el.style.pointerEvents = "none"; 
    
    // 拡大中のボックスもリセット
    const box = document.getElementById('hover-preview-box');
    if(box) box.style.pointerEvents = "none";

    isLongPressActive = false; 
    
    // 一時的にホバーを無効化（閉じた直後に指が触れて再発火するのを防ぐ）
    hoverTemporarilyDisabled = true;
    setTimeout(() => { 
        hoverTemporarilyDisabled = false; 
    }, 500);
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
            <div class="flex ${isVertical ? 'flex-col' : 'flex-row'} items-center gap-1 text-[12px] justify-center relative">
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
    if (!players || !players.length) return;

    // --- 修正箇所：自分自身の判定を強化 ---
    // 1. FirebaseのUIDで判定 2. 名前が 'Guest' かどうかで判定 3. デフォルトは ID:1
    let myId = 1;
    const profileUid = (typeof userProfile !== 'undefined') ? userProfile.uid : null;
    
    const me = players.find(pl => (profileUid && pl.uid === profileUid) || pl.name === "Guest");
    if (me) {
        myId = me.id;
    }

    // デバッグ用：誰の視点で見ているかコンソールに強制表示
    console.log(`[View Check] My ID is: ${myId}, My Name is: ${me ? me.name : 'Unknown'}`);

    const p = players.find(pl => pl.id === myId) || players[0];
    
    // 自分のIDが 1 でない（ゲスト側）場合、盤面を反転
    const isInverted = (myId !== 1);
    if (isInverted) console.log("[View Check] Board Inverted for Guest view.");

    // --- 条件付き監視ロジック ---
    if (!selectionState.active && !isProcessingMove) { 
        players.forEach(pObj => {
            if (pObj.x === -1 || pObj.y === -1) return;
            const cell = board[pObj.y][pObj.x];
            if (cell && !cell.empty && cell.revealed && pObj.processedArrivalCard !== cell.color) {
                pObj.processedArrivalCard = cell.color;
                setTimeout(() => {
                    handleArrivalLogic(cell, pObj, null, cell.color, false);
                }, 50);
            }
        });
    }

    // 盤面描画ループ（isInvertedがtrueなら逆順にループ）
    for (let i = 0; i < GRID_SIZE; i++) {
        for (let j = 0; j < GRID_SIZE; j++) {
            const y = isInverted ? (GRID_SIZE - 1 - i) : i;
            const x = isInverted ? (GRID_SIZE - 1 - j) : j;
            
            const cell = board[y][x];
            const div = document.createElement('div');
            let cls = "cell relative rounded-sm flex items-center justify-center transition-all duration-300 w-full h-full hover-zoom ";
            
            const owner = players.find(pl => pl.startPos.x === x && pl.startPos.y === y);
            let gateOverlay = '';
            if (owner) {
                const borderColor = owner.color.hex; 
                gateOverlay = `<div class="gate-glow-overlay" style="border: 2px solid ${borderColor}; box-shadow: 0 0 5px ${borderColor};"></div>`;
            }
            
            let cardDisplay = '';
            if (cell && !cell.empty && cell.color) {
                if (cell.revealed) { 
                    const label = cell.color.image ? "" : `<span class="z-10">${cell.color.name[0]}</span>`;
                    cardDisplay = `<div class="w-full h-full border border-white/5 flex items-center justify-center shadow-sm pointer-events-none relative overflow-hidden" style="font-size: 8px; ${cell.color.image ? `background-image: url('${cell.color.image}'); background-size: cover; background-position: center;` : `background-color: ${cell.color.hex};`}">
                        ${label}
                    </div>`; 
                } else {
                    cardDisplay = `<div class="w-full h-full rounded-sm card-back-pattern border border-gray-500/30 flex items-center justify-center pointer-events-none"><span class="text-white opacity-20 text-[8px] font-bold">?</span></div>`;
                }
                const stackCount = (cell.stack || []).filter(c => c).length;
                if(stackCount > 0) cardDisplay += `<div class="stack-badge">+${stackCount}</div>`;
            } else {
                cls += "bg-transparent "; 
            }

            if (p && selectionState.active) {
                const isSelectable = isCellSelectable(x, y);
                if (isSelectable) {
                    cls += "selectable ring-2 ring-green-400 opacity-100 z-50 "; 
                    div.onclick = () => { if(!isLongPressActive) handleSelection(x, y); };
                    if (selectionState.selected.some(s => s.x === x && s.y === y)) {
                        cls += "ring-4 ring-yellow-500 "; 
                        if (selectionState.count > 1) {
                            const selIdx = selectionState.selected.findIndex(s => s.x === x && s.y === y);
                            cardDisplay += `<div class="absolute top-0 left-0 bg-yellow-500 text-black text-[10px] font-bold px-1 z-[60] shadow-sm">${selIdx + 1}</div>`;
                        }
                    }
                } else { 
                    cls += "opacity-30 grayscale "; 
                }
            } else if (p) {
                const pOnCell = players.find(ep => ep.id !== p.id && ep.x === x && ep.y === y);
                const dist = Math.abs(p.x - x) + Math.abs(p.y - y);
                const isTarget = (p.dimensionActive && !p.baseMoveUsed) ? (dist === 2) : (dist === 1);
                
                if (isPlacingCard) { 
                    if (isTarget && !pOnCell) { cls += "ring-2 ring-green-400 cursor-pointer z-50 "; div.onclick = () => { if(!isLongPressActive) executePlaceCard(x, y); }; } 
                    else cls += "opacity-50 "; 
                } 
                else if (!winner && currentPhase === PHASE.MOVE && isTarget && !isStuck && !isProcessingMove) { 
                    const canStep = !cell.empty || pOnCell; 
                    if (canStep) { 
                        let showRing = false;
                        if (pOnCell) { 
                            if (!p.konohanaPenalty) { cls += "ring-2 ring-red-500 cursor-pointer z-50 "; showRing = true; } 
                        }
                        else { 
                            if (!p.marmegoPenalty) { cls += "ring-2 ring-green-400 cursor-pointer z-50 "; showRing = true; } 
                        }
                        if (showRing) div.onclick = () => { if(!isLongPressActive) handleBoardClick(x, y); };
                    } else cls += "opacity-50 cursor-not-allowed "; 
                } else cls += "opacity-90 ";
            }

            div.className = cls; 
            div.innerHTML = cardDisplay + gateOverlay; 

            const whimInfo = richWhimHistory.find(h => h.pos.x === x && h.pos.y === y);
            if (whimInfo) {
                div.classList.add('rich-whim-highlight');
                div.style.setProperty('--player-color', whimInfo.player.color.hex);
                const label = document.createElement('div');
                label.className = 'whim-label';
                const originalName = whimInfo.player.name || "";
                label.textContent = originalName.length > 3 ? originalName.substring(0, 3) + ".." : originalName;
                div.appendChild(label);
            }

            const pOnCellMarker = players.find(pl => x === pl.x && y === pl.y && x !== -1); 
            if (pOnCellMarker) { 
                const isActive = (turn === players.indexOf(pOnCellMarker)); 
                const pDiv = document.createElement('div'); 
                pDiv.id = `p${pOnCellMarker.id}-marker`; 
                pDiv.className = `player-marker`; 
                const rotateX = -50;
                pDiv.style.setProperty('--rotate-x', `${rotateX}deg`);
                pDiv.style.setProperty('--rotate-y', `0deg`);
                const verticalScale = 1.2 - (y * 0.03); 
                pDiv.style.transform = `rotateX(${rotateX}deg) translateZ(15px) translateY(-40px) scaleY(${verticalScale})`;                
                
                if (pOnCellMarker.pieceImage) {
                    const faces = ['front', 'top', 'left', 'right', 'back'];
                    faces.forEach(name => {
                        const f = document.createElement('div');
                        f.className = `cube-face face-${name}`;
                        f.style.backgroundImage = `url('${pOnCellMarker.pieceImage}')`;
                        pDiv.appendChild(f);
                    });
                    if (isActive) {
                        const aura = document.createElement('div');
                        aura.className = 'cube-aura-layer';
                        aura.style.setProperty('--aura-color', pOnCellMarker.color.hex || '#fff');
                        pDiv.appendChild(aura);
                    }
                }
                if (isActive) {
                    div.classList.add('player-active'); 
                    pDiv.style.setProperty('--player-color-glow', pOnCellMarker.color.hex || '#fff');
                    div.style.opacity = "1";
                }
                div.appendChild(pDiv); 
            }
            if (cell && !cell.empty && cell.color && cell.revealed) {
                attachHoverEvents(div, cell.color, true);
            }
            boardEl.appendChild(div);
        }
    }
}

/**
 * 2026/03/21 修正：手札の扇状レイアウト（Fan Mode）対応
 */
function renderHand() {
    const handEl = document.getElementById('current-hand');
    const handCountEl = document.getElementById('hand-count');
    const handInstruction = document.getElementById('hand-instruction');
    
    const isForcedCpu = (typeof window.FORCED_CPU_MODE !== 'undefined' && window.FORCED_CPU_MODE);
    
    let displayTurn;
    if (isForcedCpu) {
        displayTurn = turn;
        if (handInstruction && players[turn]) {
            handInstruction.textContent = `${players[turn].name}'S HAND`;
        }
    } else {
        displayTurn = (typeof isP1HandOnlyView !== 'undefined' && isP1HandOnlyView) ? 0 : turn;
        if (handInstruction) handInstruction.textContent = "YOUR HAND";
    }

    if (!handEl || !players || !players[displayTurn]) return;
    const p = players[displayTurn];
    const pHand = hands[p.id] || [];
    
    if (handCountEl) handCountEl.textContent = `${pHand.length}枚`;
    handEl.innerHTML = '';

    // 表示モード（grid または fan）に応じてクラスを切り替え
    const mode = (typeof handDisplayMode !== 'undefined') ? handDisplayMode : 'grid';
    if (mode === 'fan') {
        handEl.classList.add('hand-fan-mode');
    } else {
        handEl.classList.remove('hand-fan-mode');
    }

    players.forEach(player => {
        const countSpan = document.getElementById(`p${player.id}-hand-count`);
        if (countSpan) countSpan.textContent = (hands[player.id] || []).length;
    });

    pHand.forEach((card, index) => {
        const cardDiv = document.createElement('div');
        const isSelected = (activeHandCard === card);
        
        let canPlay = true;
        if (card.sealed) {
            canPlay = false;
        } else if (currentPhase === PHASE.HAND) {
            canPlay = typeof canPlayHandEffect === 'function' ? canPlayHandEffect(card, p) : true;
        } else if (currentPhase === PHASE.LOCK) {
            const isSpecialColor = ['white', 'black', 'rainbow'].includes(card.colorId);
            const pColl = collections[p.id] || {};
            const slotCards = pColl[card.colorId] || [];
            const hasCurse = slotCards.length > 0 ? slotCards.some(c => c.id === 34) : false;
            const isAlreadyLocked = !isSpecialColor && slotCards.length > 0 && !(hasCurse && slotCards.length < 3);

            if (card.type === "ETERNAL" || isSpecialColor || isAlreadyLocked) {
                canPlay = false;
            }
        }

        let txtCls = card.colorId === 'white' ? 'text-gray-800' : (card.colorId === 'black' ? 'text-gray-200' : 'text-white');
        let faceClass = card.type === "ETERNAL" ? "eternal-card-face" : card.bg;
        
        cardDiv.className = `hand-card w-16 h-16 rounded border-2 border-white ${faceClass} flex flex-col items-center justify-center shadow-lg cursor-pointer transition-all relative overflow-hidden shrink-0 ${isSelected ? 'ring-4 ring-yellow-400' : ''} ${!canPlay ? 'card-dimmed opacity-60 grayscale cursor-not-allowed' : ''} ${card.fromViridian ? 'viridian-temp-card' : ''}`;
        
        /**
         * 2026/03/21 修正：扇状モードの回転ハンドル対応
         */
        if (mode === 'fan') {
            const total = pHand.length;

            // 重なり具合の上限を 5度 に設定（これより狭くなる場合にハンドルを出す）
            const baseStep = 8;
            const maxTotalAngle = 100;
            let stepDeg = Math.min(baseStep, maxTotalAngle / Math.max(1, total - 1));
            
            // 2026/03/21 修正：ハンドル出現条件を10枚以上に緩和し、操作性を向上
            const needsHandle = total >= 10;

            // 1枚あたりのずらし角度を少し広めに確保（重なりすぎ防止）
            if (total >= 10) stepDeg = Math.max(stepDeg, 6); 

            const arcAngle = (total - 1) * stepDeg;
            const startAngle = -arcAngle / 2;
            const angle = startAngle + (index * stepDeg) + (typeof handFanRotation !== 'undefined' ? handFanRotation : 0);
            
            const radius = 300; 
            const verticalPosition = -15; 

            const rad = (angle - 90) * (Math.PI / 180);
            const xOffset = Math.cos(rad) * radius;
            const yOffset = Math.sin(rad) * radius + radius + verticalPosition;

            const baseTransform = `translate(-50%, -50%) translateX(${xOffset}px) translateY(${yOffset}px) rotate(${angle}deg)`;
            cardDiv.style.transform = baseTransform;
            cardDiv.style.setProperty('--base-transform', baseTransform);
            cardDiv.style.zIndex = index;

            // 最後のカードの処理時にハンドルを生成/表示
            if (index === total - 1 && needsHandle) {
                const handleId = 'hand-fan-handle';
                let handleWrap = document.getElementById(handleId);
                if (!handleWrap) {
                    handleWrap = document.createElement('div');
                    handleWrap.id = handleId;
                    handleWrap.className = 'fan-handle-container';
                    handleWrap.innerHTML = `
                        <button class="fan-nav-btn left">◀</button>
                        <button class="fan-nav-btn right">▶</button>
                    `;
                    handEl.parentElement.appendChild(handleWrap);
                    
                    handleWrap.querySelector('.left').onclick = () => { handFanRotation += 15; renderHand(); };
                    handleWrap.querySelector('.right').onclick = () => { handFanRotation -= 15; renderHand(); };
                }
            } else if (index === total - 1 && !needsHandle) {
                const handleWrap = document.getElementById('hand-fan-handle');
                if (handleWrap) handleWrap.remove();
            }
        }

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

        /**
         * 2026/03/21 修正：ドラッグ＆ドロップの開始判定を追加
         * マウスが押された（または指が触れた）瞬間にドラッグ状態を開始します。
         */
        /**
         * 2026/03/21 修正：ドラッグとクリックの競合解消パッチ
         * 押した瞬間に「まだ動いていない」フラグを立て、
         * 1pxでも動いたらクリックを無効化するようにします。
         */
        if (canPlay) {
            let hasMoved = false; // 内部フラグ：動いたかどうか

            const startDrag = (e) => {
                if (isPeekingMode || isHandEffectProcessing) return;
                isDraggingHandCard = true;
                draggedCardIndex = index;
                hasMoved = false; // 押した直後はまだ動いていない
                cardDiv.classList.add('dragging');
                if (typeof hoverTemporarilyDisabled !== 'undefined') hoverTemporarilyDisabled = true;
            };

            cardDiv.onmousedown = startDrag;
            cardDiv.ontouchstart = (e) => {
                if (e.cancelable) e.preventDefault();
                startDrag(e);
            };

            // マウスが動いたら「動いた」とみなす
            cardDiv.onmousemove = () => { if(isDraggingHandCard) hasMoved = true; };
            cardDiv.ontouchmove = () => { if(isDraggingHandCard) hasMoved = true; };

            /**
             * 2026/03/21 修正：扇状モードとグリッドモードの操作分岐
             * 扇状モード(fan)の場合は、クリック（その場で離す）による使用を廃止し、
             * 誤操作を防ぎながら「掴んで投げる」ドラッグ操作に一本化します。
             */
            cardDiv.onclick = (e) => {
                e.stopPropagation();
                
                // --- 外科手術：モードによる動作の切り分け ---
                if (mode === 'fan') {
                    // 扇状モードなら、クリック（離した瞬間）は何もしない
                    // ※ドラッグ終了判定は game_core.js の handleGlobalUp で行うため
                    isDraggingHandCard = false;
                    draggedCardIndex = null;
                    cardDiv.classList.remove('dragging');
                    return; 
                } else {
                    // グリッドモードなら、従来通りクリックでモーダルを出す
                    if (isPeekingMode || isHandEffectProcessing) return;
                    handleHandClick(index); 
                }
            };
        
        } else {
            cardDiv.onclick = (e) => {
                e.stopPropagation();
                if (card.sealed) {
                    if (typeof showToast === 'function') showToast("このカードは今ターンは使えません");
                } else if (currentPhase === PHASE.LOCK) {
                    if (typeof showToast === 'function') showToast("ロックできないカードです");
                } else if (typeof showToast === 'function') showToast("使用条件を満たしていません");
            };
        }
        if (typeof attachHoverEvents === 'function') attachHoverEvents(cardDiv, card);
        handEl.appendChild(cardDiv);
    });

    if (window.MULTIPLAY && window.MULTIPLAY.roomID) {
        const myID = window.MULTIPLAY.playerNumber;
        const myHandCount = (hands[myID] || []).length;
        const roomRef = window.MULTIPLAY.db.collection("rooms").doc(window.MULTIPLAY.roomID);
        roomRef.update({
            [`handCount_${myID}`]: myHandCount,
            "lastUpdate": Date.now()
        });
    }
}

function renderStatus() { 
    if(!players) return;
    players.forEach(p => { 
        const container = document.getElementById(`p${p.id}-status`);
        const isMyTurn = (turn === players.indexOf(p)); 

        if (container) {
            if (isMyTurn) container.classList.add("player-active-box"); 
            else container.classList.remove("player-active-box"); 
        }
        
        /* 2026/03/14 追加：プレイヤー名とアイコンを同期反映 */
        const nameEl = document.getElementById(`p${p.id}-name`);
        if (nameEl) {
            // Firebaseから届いた名前に書き換える
            nameEl.textContent = p.name || `Player ${p.id}`;
        }

        const rightsEl = document.getElementById(`p${p.id}-rights`);
        if (rightsEl) {
            rightsEl.innerHTML = '';
            rightsEl.className = "flex items-center gap-1 mt-0.5"; 

            // 1. プロフィール画像の反映
            const profImg = document.createElement('img');
            // Firebaseから届いたアイコンパスを使用（なければデフォルト）
            const iconPath = p.icon || `images/character_00${p.id}.webp`;
            profImg.src = iconPath;
            profImg.className = "w-6 h-6 rounded-full border border-gray-500 shadow-sm object-cover";
            rightsEl.appendChild(profImg);

            // 2. 手札枚数の追加
            const handInfo = document.createElement('div');
            //ステータスエリアの手札枚数のフォントサイズ
            handInfo.className = "flex items-center text-[12px] font-bold text-gray-300 mr-1";
            // 2. 手札枚数の反映（同期された枚数を使う）
            const handCount = (hands[p.id] || []).length;
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

            // 4. ディメンション権利（紫のキューブ：2マス移動）の表示を追加
            if (p.dimensionActive && !p.baseMoveUsed) {
                const dimIcon = document.createElement('div');
                // 紫色の背景とボーダー
                dimIcon.className = "rounded-sm border border-white relative overflow-hidden bg-purple-600 cursor-pointer hover:scale-110 transition-transform shadow-sm flex-shrink-0 animate-pulse";
                dimIcon.style.width = "1.1rem"; dimIcon.style.height = "1.1rem"; dimIcon.style.pointerEvents = "auto"; 
                // カードID 14 (ディメンション) の画像を使用
                dimIcon.style.backgroundImage = `url('images/card_14.webp')`; dimIcon.style.backgroundSize = "cover"; dimIcon.style.backgroundPosition = "center";
                
                // バッジの代わりに「2マス」を示すテキスト
                const dimBadge = document.createElement('div');
                dimBadge.className = "absolute -bottom-0.5 -right-0.5 bg-purple-900/90 text-white text-[5px] px-0.5 rounded-tl-sm border border-white/20 font-bold z-10";
                dimBadge.textContent = "2step"; 
                dimIcon.appendChild(dimBadge);
                
                dimIcon.onclick = (e) => { 
                    e.stopPropagation(); 
                    if (typeof showToast === 'function') showToast("ディメンション発動中：2マス移動が可能です"); 
                };
                rightsEl.appendChild(dimIcon);
            }
        }

        LOCK_ORDER.forEach(color => {
            const slotEl = document.getElementById(`p${p.id}-slot-${color.id}`); if(!slotEl) return; 
            const slotCards = collections[p.id] ? collections[p.id][color.id] : []; slotEl.innerHTML = ''; 
            slotEl.style.pointerEvents = "auto"; 
            slotEl.style.position = "relative"; 

            /** 2026/03/09 修正：特殊カードの強調クラス付与ロジックを追加 **/
            if (slotCards && slotCards.length > 0) { 
                const topC = slotCards[slotCards.length - 1];
                let txtCls = topC.colorId === 'white' ? 'text-gray-800' : (topC.colorId === 'black' ? 'text-gray-200' : 'text-white');
                
                // 基本クラスを設定
                let slotClasses = `mini-slot rounded-sm border border-white relative ${topC.bg}`;

                // --- 特殊カード（ETERNAL/FIRST）の強調判定 ---
                if (topC.type === "ETERNAL" || topC.type === "FIRST") {
                    // 他人のターンでも「特別なカード」であることがわかるように常に光らせる
                    slotClasses += " special-lock-active";
                    
                    // 自分のターン 且つ ハンドフェイズなら、使用可能であることを示す「 playable 」クラスを追加
                    if (isMyTurn && currentPhase === PHASE.HAND) {
                        slotClasses += " special-lock-playable";
                    }
                }
                
                slotEl.className = slotClasses; 
                if (topC.image) {
                    slotEl.style.backgroundImage = `url('${topC.image}')`;
                    slotEl.style.backgroundSize = 'cover';
                    slotEl.innerHTML = ""; 
                } else {
                    slotEl.innerHTML = `<span class="font-bold ${txtCls} z-10" style="font-size: 14px;">${topC.name[0]}</span>`;
                }
                if (slotCards.length > 1) { 
                    const numBadge = document.createElement('div'); 
                    numBadge.className = "absolute -bottom-1 -right-1 bg-black/80 text-yellow-400 text-[4px] px-0.5 rounded-tl-sm font-bold border-[0.3px] border-yellow-500 z-20"; 
                    numBadge.textContent = slotCards.length; 
                    slotEl.appendChild(numBadge); 
                }
                slotEl.style.opacity = "1"; 

                // 【外科手術的修正】構文エラーを解消し、論理構造を整理
                const slotKey = `p${p.id}-${color.id}`;
                const isExpanded = (expandedLockColor === slotKey);

                slotEl.onclick = (e) => {
                    e.stopPropagation();
                    hideHoverPreview(true);

                    // 1. そのカードの持ち主のターンかつハンドフェイズなら発動確認へ
                    if (isMyTurn && currentPhase === PHASE.HAND && slotCards.length === 1 && (topC.type === "FIRST" || topC.type === "ETERNAL")) {
                        handleHandClick(-1, topC);
                    } 
                    // 2. それ以外（複数枚ある場合や、他人のターンの場合）は中身を展開して見る
                    else if (slotCards.length > 0) {
                        expandedLockColor = isExpanded ? null : slotKey;
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
                            // 展開リストからも、持ち主のターンであれば発動可能に
                            if (isMyTurn && currentPhase === PHASE.HAND && (card.type === "FIRST" || card.type === "ETERNAL")) {
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
                // スロットが空の場合
                slotEl.style.opacity = "0.5"; 
                slotEl.style.borderColor = color.hex; 
                slotEl.classList.add("border-b-2"); 
                slotEl.style.backgroundImage = 'none';
                /**
                 * 2026/03/21 修正：未定義変数 isHuman によるエラーを解消
                 * 空のスロットをクリックした際に、条件なしでプレイヤー詳細モーダルを開くように修正します。
                 */
                slotEl.className = `mini-slot rounded-sm border border-gray-600 bg-gray-800 relative flex items-center justify-center`;
                slotEl.onclick = (e) => { 
                    e.stopPropagation(); 
                    if (typeof openPlayerDetailModal === 'function') {
                        openPlayerDetailModal(p.id); 
                    }
                };
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

/**
 * 2026/03/14 修正：オンライン戦の操作権限に対応したフェイズ表示
 */
/**
 * 2026/03/14 修正：オンライン戦の操作権限に対応（エラー防止版）
 */
function updatePhaseIndicator() { 
    if(!players || !players[turn]) return;
    const p = players[turn];
    const textEl = document.getElementById('instruction-text');
    const skipBtn = document.getElementById('skip-btn');
    const stuckBtn = document.getElementById('stuck-btn'); 
    const actionsContainer = document.getElementById('floating-actions');
    const rxBtn = document.getElementById('reaction-skip-btn');
    
    if(!textEl) return;

    // 1. フェイズ表示の更新
    document.querySelectorAll('.phase-step').forEach(el => el.classList.remove('active', 'passed')); 
    if (currentPhase === PHASE.LOCK) document.getElementById('phase-lock').classList.add('active'); 
    else if (currentPhase === PHASE.HAND) { document.getElementById('phase-lock').classList.add('passed'); document.getElementById('phase-hand').classList.add('active'); } 
    else if (currentPhase === PHASE.MOVE) { document.getElementById('phase-lock').classList.add('passed'); document.getElementById('phase-hand').classList.add('passed'); document.getElementById('phase-move').classList.add('active'); } 
    
    if(actionsContainer) actionsContainer.classList.remove('hidden');

    /* --- 【重要】操作権限の判定（変数名を一本化） --- */
    let isForbiddenAction = false;
    if (window.MULTIPLAY && window.MULTIPLAY.roomID) {
        // オンライン戦：今の手番(p.id)が自分の番号と違えば禁止
        isForbiddenAction = (p.id !== window.MULTIPLAY.playerNumber);
    } else {
        // 通常戦（CPU戦含む）：既存のP1固定フラグがあればそれに従う
        isForbiddenAction = (typeof isP1HandOnlyView !== 'undefined' && isP1HandOnlyView && turn !== 0);
    }

    // 2. スキップボタンの表示制御
    if(skipBtn) {
        const shouldHide = selectionState.active || currentPhase === PHASE.MOVE || isForbiddenAction;
        skipBtn.classList.toggle('hidden', shouldHide); 
        if(currentPhase !== PHASE.MOVE) {
            skipBtn.textContent = currentPhase === PHASE.LOCK ? "ロックしない" : "ムーブへ"; 
        }
    }
    
    // 3. 配置ボタンの表示制御
    if(stuckBtn) {
        const canPlace = (currentPhase === PHASE.MOVE && isStuck && !isPlacingCard && !p.baseMoveUsed);
        stuckBtn.classList.toggle('hidden', selectionState.active || !canPlace || isForbiddenAction); 
    }
    
    // 4. 反応スルーボタン
    const anyAnytimeCard = players.some(pl => hands[pl.id] && hands[pl.id].some(c => c.handEffect?.anytime));
    if (rxBtn) {
        if (anyAnytimeCard && !selectionState.active && !isForbiddenAction) { 
            rxBtn.classList.remove('hidden'); 
            rxBtn.textContent = `反応スルー: ${p.reactionSkip ? 'ON' : 'OFF'}`; 
        } else { 
            rxBtn.classList.add('hidden'); 
        }
    }
    
    // 5. ガイドテキストの更新
    if (winner) textEl.textContent = "勝者決定"; 
    else if (isPlacingCard) textEl.textContent = "配置：場所タップ"; 
    else if (selectionState.active) textEl.innerHTML = `<span class="text-yellow-400 font-bold animate-pulse">${selectionState.prompt}</span>`; 
    else if (p.extraMoves > 0 && currentPhase === PHASE.MOVE && p.baseMoveUsed) textEl.innerHTML = `<span class="text-red-400 font-bold animate-pulse">追加移動権利：場所タップ</span>`;
    else {
        const actionName = currentPhase === PHASE.LOCK ? 'ロック可' : currentPhase === PHASE.HAND ? '手札使用' : '移動';
        const colorClass = (p.color && p.color.bg) ? p.color.bg.replace('bg-', 'text-') : 'text-white';
        textEl.innerHTML = `<span class="${colorClass}">${p.name}</span>: ${actionName}`;
    }
}

function updateTimerVisual() {
    /** 2026/03/05 追加: 変数が未定義（リセット中）の場合は、処理を完全にスキップしてエラーを防ぐ **/
    if (typeof currentPhaseMaxTime === 'undefined' || !currentPhaseMaxTime) return;

    const bar = document.getElementById('timer-bar');
    const textEl = document.getElementById('instruction-text');
    const timerText = document.getElementById('timer-text'); 
    
    let p = null;
    if (typeof activeTimerPlayerId !== 'undefined' && activeTimerPlayerId !== null) {
        p = players.find(pl => pl.id === activeTimerPlayerId);
    }
    if (!p) p = players[turn];

    if(!bar || !p) return;

    const totalCurrent = useGlobalTimer ? (timeLeft + p.totalTimeLeft) : timeLeft;
    const maxPossible = useGlobalTimer ? (currentPhaseMaxTime + 180) : currentPhaseMaxTime;
    
    const pct = Math.max(0, Math.min(100, (totalCurrent / maxPossible) * 100));

    // --- 【外科手術的修正】色の変更とアニメーションの分離 ---
    // 1. 色のクラスを入れ替える（ここは transition の影響を受けない）
    const currentClasses = bar.className.split(' ');
    const cleanClasses = currentClasses.filter(cls => !cls.startsWith('bg-'));
    const newClassName = [...cleanClasses, p.color.bg].join(' ');
    
    if (bar.className !== newClassName) {
        bar.style.transition = 'none'; // 色が変わる瞬間だけアニメを止める
        bar.className = newClassName;
        void bar.offsetWidth; // 即時反映
    }

    // 2. 幅の減少アニメーションを「常に1秒」に設定し直す
    bar.style.transition = 'width 1s linear'; 
    bar.style.width = `${pct}%`; 

    if (timerText) {
        timerText.textContent = `${Math.max(0, totalCurrent).toFixed(0)}s`;
        if (!useGlobalTimer && timeLeft > (window.PHASE_TIME_SEC || 15)) {
            timerText.classList.add('text-red-500');
        } else {
            timerText.classList.remove('text-red-500');
        }
    }

    if (useGlobalTimer && textEl) {
        const minutes = Math.floor(p.totalTimeLeft / 60);
        const seconds = p.totalTimeLeft % 60;
        const timeStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        const parts = textEl.innerHTML.split(' | ');
        textEl.innerHTML = `${parts[0]} | <span class="text-blue-400">⏳${timeStr}</span>`;
    }
}

/**
 * UI上のプロフィールボタンの画像を現在の設定に更新する
 */
/**
 * 2026/03/13 修正：プロフィール表示の更新（Google連携対応）
 * UI上のプロフィールボタンや名前を現在の userProfile の内容に同期します。
 */
function updateProfileButtonVisual() {
    const iconImgs = document.querySelectorAll('.profile-button-icon-img');
    const homeName = document.getElementById('home-user-name');
    
    // 1. 画像パスの決定
    let targetSrc = userProfile.icon;

    // Google等の外部URL(http...)でなければ、従来の駒画像→キャラ画像変換を行う
    if (targetSrc && !targetSrc.startsWith('http')) {
        if (targetSrc.includes('piece_00')) {
            targetSrc = targetSrc.replace('piece_00', 'character_00').replace('.png', '.webp');
        }
    }
    
    // 画像が空ならデフォルトをセット
    if (!targetSrc) targetSrc = "images/character_001.webp";

    // 2. アイコン画像の一斉反映
    iconImgs.forEach(img => {
        img.src = targetSrc;
    });

    /** 2026/03/17 修正：ホーム画面の名前、ランク、および称号を同期 **/
    if (homeName && userProfile.name) {
        homeName.textContent = userProfile.name;
    }

    const homeTitle = document.getElementById('home-user-title');
    if (homeTitle && userProfile.selectedTitle) {
        homeTitle.textContent = `称号: ${userProfile.selectedTitle}`;
    }

    const homeRank = document.getElementById('home-rank-num');
    if (homeRank) {
        homeRank.textContent = userProfile.rank || 1;
    }

    // 4. ログへの反映（任意：必要なら）
    console.log(`[UI Sync] Name: ${userProfile.name}, Icon: ${targetSrc}`);
}


/**
 * 2026/03/17 修正：ダイナミック背景の粒子生成
 */
/**
 * 2026/03/17 修正：背景粒子の増量とランダム性の強化
 */
document.addEventListener('DOMContentLoaded', () => {
    const bg = document.getElementById('dynamic-bg-container');
    if (!bg) return;

    // 粒子を40個に増量
    for (let i = 0; i < 40; i++) {
        const p = document.createElement('div');
        p.className = 'particle';
        // 大きさを2px〜8pxの間でバラつかせる
        const size = Math.random() * 6 + 2; 
        p.style.width = `${size}px`;
        p.style.height = `${size}px`;
        // 開始位置を画面全体に散らす
        p.style.left = `${Math.random() * 100}%`;
        // 昇っていく時間を10秒〜40秒の間でランダムに
        p.style.setProperty('--d', `${10 + Math.random() * 30}s`); 
        // 出現タイミングをバラバラにして一斉に出るのを防ぐ
        p.style.animationDelay = `-${Math.random() * 30}s`;
        // 透明度もランダムにして奥行きを出す
        p.style.opacity = Math.random() * 0.5 + 0.2;
        bg.appendChild(p);
    }
});