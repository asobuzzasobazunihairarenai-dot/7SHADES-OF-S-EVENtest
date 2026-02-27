/**
 * 7 SHADES OF S:EVEN - Core Logic
 * 【共通定義】
 * - 到達: 表向きカードの上に駒が置かれた瞬間
 * - 到達効果: 到達時に発動。原則「効果解決」→「カード獲得」の順。
 * - 例外: カードに処遇（場に残る、破棄等）が書かれている場合はそれに従う。
 */
/**
 * 2026/02/07 10:20 修正
 * 1. 処理順の原則に基づき、発動者が対象に含まれる場合は「発動者(P3) -> P4 -> P1 -> P2」の順で処理されることを確認・維持。
 * 2. rich_whim_logic、frog_arrival、frog_hand において発動者から開始するシーケンスを保証。
 */

/**
 * 手札効果が現在使用可能かどうかを判定する
 */
function canPlayHandEffect(card, p) {
    // 【修正】カードが存在しない、または現在処理中の場合は使用不可
    if (!card || !card.handEffect || card.isProcessing) return false;

    // 【追加】封印状態（このターン使えない効果等）のカードは使用不可
    if (card.sealed) return false;

    // 「1ターンに1度」制限があるカードID（11:ヴァーディアンなど）の判定
    const oncePerTurnIDs = [11]; 
    if (oncePerTurnIDs.includes(card.id)) {
        if (usedOnceEffectsThisTurn.includes(card.id)) return false;
    }

    // ID 15: ダッシュ - 移動できるマスがない場合はグレーアウト
    if (card.id === 15) {
        // checkStuck(p) が true = どこにも動けない状態
        if (typeof checkStuck === 'function' && checkStuck(p)) return false;
    }

    // ID 21: ちょっと待った! 
    if (card.id === 21) return false; 

    // ID 22: 反撃
    if (card.id === 22) return false;

    // ID 30: カラフルホール の有効化条件
    if (card.id === 30) {
        // 全プレイヤーのロック数を算出
        const lockCounts = players.map(pl => {
            let count = 0;
            LOCK_ORDER.forEach(col => {
                const slot = collections[pl.id][col.id];
                if (slot && slot.length > 0) count += slot.length;
            });
            return count;
        });
        const maxL = Math.max(...lockCounts);

        // 最多ロック者のうち、奪えるカード（Normalかつ白黒以外）を1枚でも持っているプレイヤーがいるか
        const hasValidTarget = players.some((pl, idx) => {
            if (lockCounts[idx] !== maxL) return false;
            return LOCK_ORDER.some(col => {
                const slot = collections[pl.id][col.id];
                if (slot && slot.length > 0) {
                    const topC = slot[slot.length - 1];
                    // エターナル、ファースト、および白・黒（呪い等）は対象外
                    return topC.type !== 'ETERNAL' && topC.type !== 'FIRST' && topC.colorId !== 'white' && topC.colorId !== 'black';
                }
                return false;
            });
        });
        if (!hasValidTarget) return false;
    }

    // ID 32: いろ落ちガエル の有効化条件
    if (card.id === 32) {
        const hasValidTarget = players.some(opp => {
            return LOCK_ORDER.some(col => {
                const slot = collections[opp.id][col.id];
                if (slot && slot.length > 0) {
                    const topCard = slot[slot.length - 1];
                    return topCard.type !== 'ETERNAL' && topCard.type !== 'FIRST' && topCard.colorId !== 'white' && topCard.colorId !== 'black';
                }
                return false;
            });
        });
        if (!hasValidTarget) return false;
    }

    // ID 33: 強欲なパレット
    if (card.id === 33) {
        const lockCounts = players.map(pl => {
            let count = 0;
            LOCK_ORDER.forEach(col => {
                const slot = collections[pl.id][col.id];
                if (slot && slot.length > 0) count += slot.length;
            });
            return count;
        });
        const maxL = Math.max(...lockCounts);
        // 最多ロック者のうち、手札が1枚以上あるプレイヤーが1人でもいれば使用可能
        const candidates = players.filter((pl, idx) => lockCounts[idx] === maxL);
        const anyoneHasHand = candidates.some(pl => (hands[pl.id] || []).length > 0);
        if (!anyoneHasHand) return false;
    }

    // ID 34: にじいろの呪い
    if (card.id === 34) {
        const lockCounts = players.map(pl => ({
            id: pl.id,
            count: LOCK_ORDER.reduce((sum, col) => sum + (collections[pl.id][col.id].some(c => c.id !== 34 && c.colorId !== 'white' && c.colorId !== 'black') ? 1 : 0), 0)
        }));
        const maxL = Math.max(...lockCounts.map(l => l.count));
        
        // 「最多ロック」かつ「空きスロットが1つ以上ある」プレイヤーが1人でもいるか
        const hasValidTarget = players.some(pl => {
            const myCount = LOCK_ORDER.reduce((sum, col) => sum + (collections[pl.id][col.id].some(c => c.id !== 34 && c.colorId !== 'white' && c.colorId !== 'black') ? 1 : 0), 0);
            const hasEmpty = LOCK_ORDER.some(col => collections[pl.id][col.id].length === 0);
            return myCount === maxL && hasEmpty;
        });
        return hasValidTarget;
    }

    const act = card.handEffect.action;
    if (!act) return true;

    if (card.handEffect.cost) {
        const cost = card.handEffect.cost;
        const candidates = hands[p.id].filter(c => (c.colorId === cost.color || c.colorId === 'rainbow') && c !== card);
        if (candidates.length < cost.amount) return false;
    }

    if (act.type === 'civil_path_hand') {
        const emptyCount = board.flat().filter(c => c.empty).length;
        const faceDownCards = [];
        for(let y=0; y<GRID_SIZE; y++) {
            for(let x=0; x<GRID_SIZE; x++) {
                const cell = board[y][x];
                if(cell.empty || cell.revealed) continue;
                let isAroundOpponent = false;
                players.forEach(pl => {
                    if(pl.id === p.id) return;
                    if(Math.abs(pl.x - x) <= 1 && Math.abs(pl.y - y) <= 1) isAroundOpponent = true;
                });
                if(!isAroundOpponent) faceDownCards.push({x, y});
            }
        }
        if (emptyCount < 2 || faceDownCards.length < 2) return false;
    }
    
    else if (act.type === 'apocalypse_arrival') {
        const pHand = hands[p.id] || [];
        const candidates = pHand.filter(c => c !== contextCard && (!p.currentArrivalCard || c !== p.currentArrivalCard));
        
        if (candidates.length === 0) {
            addLog(`[System] ${p.name}は配置できる手札がありません。`); 
            
            // 修正箇所：他のモーダル（到達確認等）が閉じるのを待ってから表示
            setTimeout(() => {
                showMessageOverlay("配置できる手札がないため、\n予言者の技は不発に終わりました。", 2000, () => {
                    if(typeof onSuccess === 'function') onSuccess({});
                });
            }, 500); 
            return;
        }

        showSelectionModal("アポカリプス：配置", "裏向きで配置する手札を1枚選択", candidates, "card-back-pattern", 1, (selCards) => {
            const cardToPlace = selCards[0]; 
            const hIdx = hands[p.id].indexOf(cardToPlace);
            if(hIdx > -1) hands[p.id].splice(hIdx, 1);
            
            activeHandCard = cardToPlace;
            startSelectionMode('select_cell', 1, 'apocalypse_placed_logic', "配置するマスを選択（周囲1マス）", onSuccess, 1, null, true, p, true, null, null, null, p);
        }, false, null, null, null, p); 
        return;
    }

    if ((act.type === 'select_cell' || act.type === 'select_line') && act.range !== null && act.range !== undefined) {
        let validCount = 0;
        for (let y = 0; y < GRID_SIZE; y++) {
            for (let x = 0; x < GRID_SIZE; x++) {
                const dx = Math.abs(p.x - x), dy = Math.abs(p.y - y);
                let inRange = act.isEightDirection ? (dx <= act.range && dy <= act.range) : (dx + dy <= act.range);
                if (inRange) {
                    const cell = board[y][x];
                    let selectable = true;
                    if (['add_to_hand', 'destroy_all', 'destroy_top'].includes(act.logic) && (cell.empty || cell.color.type === 'FIRST' || cell.color.type === 'ETERNAL')) selectable = false;
                    if (act.logic === 'open_facedown' && (cell.empty || cell.revealed)) selectable = false;
                    if (selectable) validCount++;
                }
            }
        }
        if (validCount === 0) return false;
    }

    return true;
}

function executeCardEffect(def, p, onSuccess, contextCard = null, isNewReveal = false) {
    if (!def) { 
        isHandEffectProcessing = false; 
        onSuccess({}); 
        return; 
    }
    
    const wrappedSuccess = (res) => {
        isHandEffectProcessing = false;

        // 【追加】自動処理によって発動していた場合、効果解決が終わった時点でフラグを解除
        if (isAutoProcessing) {
            isAutoProcessing = false;
            isAutoAction = false;
        }
        
        // 【追加】1ターンに1度制限のカード（ID 11: ヴァーディアンなど）なら記録
        const oncePerTurnIDs = [11]; 
        if (contextCard && oncePerTurnIDs.includes(contextCard.id)) {
            usedOnceEffectsThisTurn.push(contextCard.id);
        }

        if (onSuccess) onSuccess(res);
    };

    

    if (def.cost) {
        const candidates = hands[p.id].filter(c => (c.colorId === def.cost.color || c.colorId === 'rainbow') && c !== activeHandCard);
        if (candidates.length < def.cost.amount) { 
            showToast("コスト不足"); 
            isHandEffectProcessing = false; 
            return; 
        }
        showSelectionModal("コスト支払い", "捨てるカードを選択してください", candidates, "card-back-pattern", def.cost.amount, (sel) => {
            sel.forEach(c => { 
                const curIdx = hands[p.id].indexOf(c); 
                if(curIdx > -1) {
                    const removed = hands[p.id].splice(curIdx, 1)[0];
                    discardPile.push(removed);
                }
            });

            // 手札から抜くが、捨て札に送るかは res.stayOnBoard を見て判断する
            const handIdx = activeHandCard ? hands[p.id].indexOf(activeHandCard) : -1;
            const usedCard = handIdx > -1 ? hands[p.id].splice(handIdx, 1)[0] : null;

            renderHand(); 
            runAction(def.action, p, (res) => {
                // 効果解決後に判定
                if (usedCard && !(res && res.stayOnBoard)) {
                    discardPile.push(usedCard);
                }
                wrappedSuccess(res);
            }, contextCard, isNewReveal);
        }, false, () => {
            isHandEffectProcessing = false;
        });
    } else {
        // コストがない場合も同様
        const handIdx = activeHandCard ? hands[p.id].indexOf(activeHandCard) : -1;
        const usedCard = handIdx > -1 ? hands[p.id].splice(handIdx, 1)[0] : null;
        
        renderHand();

        if (def.action) {
            runAction(def.action, p, (res) => {
                // 効果解決後に判定
                if (usedCard && !(res && res.stayOnBoard)) {
                    discardPile.push(usedCard);
                }
                wrappedSuccess(res);
            }, contextCard, isNewReveal);
        } else { 
            if (usedCard) discardPile.push(usedCard); // アクションなしなら通常破棄
            if(def.msg) addLog(def.msg); 
            isHandEffectProcessing = false; 
            onSuccess({}); 
        }
    }
}

function runAction(act, p, onSuccess, contextCard = null, isNewReveal = false) {
    if (!act) { if (onSuccess) onSuccess({}); return; }

    // ★追加：発動回数の記録（contextCardが存在する場合のみ）
    if (contextCard && contextCard.name) {
        if (!cardUsageStats[p.id]) cardUsageStats[p.id] = {};
        cardUsageStats[p.id][contextCard.name] = (cardUsageStats[p.id][contextCard.name] || 0) + 1;
    }

    const forceNoCancel = true;

    if (act.type === 'apocalypse_hand') {
        const startApocalypseFlow = () => {
            showSelectionModal("色宣言 (アポカリプス)", "宣言する色を2色選んでください", BASE_COLORS, "card-back-pattern", 2, (selCols) => {
                const targetIds = selCols.map(c => c.id);
                
                // 宣言内容のHTML構築（文字を大きく、背景チップ付きで表示）
                const colNames = selCols.map(c => `<span class="${c.bg} px-4 py-2 rounded-lg text-white mx-2 shadow-lg text-xl font-black">${c.name}</span>`).join(' <span class="text-gray-400">と</span> ');
                const declarationMsg = `<div class="text-center">
                    <p class="text-sm text-gray-400 mb-4">${p.name} の予言...</p>
                    <div class="flex justify-center items-center">${colNames}</div>
                </div>`;

                // showMessageOverlay を使用して2秒間表示し、その後に自動でドロー処理へ
                showMessageOverlay(declarationMsg, 3000, () => {
                    const drawn = drawCard();
                    if (!drawn) {
                        addLog("山札切れのため終了します。");
                        if (onSuccess) onSuccess({});
                        return;
                    }
                    
                    showCardModal(drawn, () => {
                        hands[p.id].push(drawn);
                        renderHand();
                        if (targetIds.includes(drawn.colorId) || drawn.colorId === 'rainbow') {
                            addLog(`的中！「${drawn.name}」を引き当てました。`);
                            showMessageOverlay("予言的中！\n効果を繰り返します。", 1500, startApocalypseFlow);
                        } else {
                            addLog(`不的中。「${drawn.name}」でした。`);
                            showMessageOverlay("予言失敗。\n効果を終了します。", 1500, () => {
                                if (onSuccess) onSuccess({});
                            });
                        }
                    }, "ドロー＆公開", p.name, "アポカリプス予言解決中...");
                });

            }, false, () => { if(onSuccess) onSuccess({}); }, null, null, p);
        };
        startApocalypseFlow();
        return;
    }

    if (act.type === 'apocalypse_arrival') {
        // 配置可能な手札（自分自身を除く）を抽出
        const candidates = hands[p.id].filter(c => c !== contextCard);

        if (candidates.length === 0) {
            // 手札がない場合、不発のモーダルを表示して終了
            showMessageOverlay("配置できる手札がないため、\n予言者の技は不発に終わりました。", 2500, () => {
                addLog(`[System] ${p.name}は手札がないため配置不能。`);
                if (onSuccess) onSuccess({});
            });
            return;
        }

        // 手札がある場合は通常通り選択モーダルを表示
        showSelectionModal("アポカリプス：配置", "裏向きで配置する手札を1枚選択", candidates, "card-back-pattern", 1, (selCards) => {
            const cardToPlace = selCards[0]; 
            hands[p.id].splice(hands[p.id].indexOf(cardToPlace), 1);
            activeHandCard = cardToPlace;
            startSelectionMode('select_cell', 1, 'apocalypse_placed_logic', "配置するマスを選択（周囲1マス）", onSuccess, 1, null, true, p, true, null, null, null, p);
        }, false, null, null, null, p); 
        return;
    }

    if (act.type === 'select_cell' || act.type === 'select_line' || act.type === 'select_cell_adjacent') {
        const logicName = act.logic;
        const promptText = act.prompt || '対象のマスを選択してください';
        
        // 自分自身の位置を特定し、adjacentタイプなら禁止マスとしてセット
        const myPos = { x: p.x, y: p.y };
        const forbidden = (act.type === 'select_cell_adjacent') ? myPos : null;

        // 成功時のコールバック定義（既存の onSuccess 呼び出しを確実に含むようにする）
        const handleSuccess = (res) => {
            if (onSuccess) onSuccess(res);
        };

        let validCount = 0;
        for (let y = 0; y < GRID_SIZE; y++) {
            for (let x = 0; x < GRID_SIZE; x++) {
                const cell = board[y][x];
                let isPotentiallySelectable = true;

                // 自身のマス(forbidden)と一致する場合は、真っ先に除外
                if (forbidden && x === forbidden.x && y === forbidden.y) {
                    isPotentiallySelectable = false;
                }

                if (isPotentiallySelectable && act.range !== null && act.range !== undefined) {
                    const dx = Math.abs(p.x - x), dy = Math.abs(p.y - y);
                    let inRange = act.isEightDirection ? (dx <= act.range && dy <= act.range) : (dx + dy <= act.range);
                    if (!inRange) isPotentiallySelectable = false;
                }
                
                if (isPotentiallySelectable) {
                   // 空きマスである必要があるロジックのリストに 'place_deck_sequential_empty' を追加
                    if (['place_deck_facedown_empty', 'place_self_facedown_empty', 'place_deck_sequential_empty'].includes(logicName)) {
                        if (!cell.empty) isPotentiallySelectable = false;
                    } else if (['add_to_hand', 'add_all_to_hand', 'destroy_all', 'destroy_top', 'civil_path_step1', 'open_facedown', 'gentecnique_logic'].includes(logicName)) {
                        if (cell.empty) isPotentiallySelectable = false;
                        if (!cell.empty && ['add_to_hand', 'add_all_to_hand', 'destroy_all', 'destroy_top', 'gentecnique_logic'].includes(logicName)) {
                            if (cell.color.type === 'FIRST' || cell.color.type === 'ETERNAL') isPotentiallySelectable = false;
                        }
                    }
                    if (act.restrictedCells && !act.restrictedCells.some(rc => rc.x === x && rc.y === y)) isPotentiallySelectable = false;
                }

                if (isPotentiallySelectable) validCount++;
            }
        }

        const finalCount = Math.min(act.count || 1, validCount);
        if (finalCount <= 0) {
            showMessageOverlay("選択可能な対象が盤面にないため、効果を終了します。", 2000, () => { if (onSuccess) onSuccess({}); });
            return;
        }
        
        const forceNoCancel = !!act.noCancel;
        // 修正箇所：第5引数に handleSuccess を渡し、第7引数に forbidden を渡す
        startSelectionMode(act.type, act.count || 1, logicName, promptText, handleSuccess, act.range, forbidden, forceNoCancel, p, act.isEightDirection, null, "おまかせ", act.restrictedCells || null, p); 
        return;
    }

    if (act.type === 'select_line') {
        startSelectionMode('select_line', 1, act.logic, act.prompt, (selection) => { if (onSuccess) onSuccess({ selection }); }, null, null, false, p, false, () => { if(onSuccess) onSuccess({ cancelled: true }); }, null, null, p);
        return;
    }

    if (act.type === 'thunder_hand') {
        startSelectionMode('select_cell', 1, 'thunder_animate_logic', '破壊するマスを選択', async (selection) => {
            if (!selection || selection.length === 0) { 
                if (onSuccess) onSuccess({}); 
                return; 
            }
            
            const pos = selection[0];
            const boardEl = document.getElementById('board-grid');
            const targetEl = boardEl.children[pos.y * GRID_SIZE + pos.x];

            // 1. ビリビリ演出の開始
            if (targetEl) {
                targetEl.classList.add('biribiri-active');
            }
            
            // 2秒間電気をまとわせる
            await new Promise(r => setTimeout(r, 2000));

            // 2. 雷エフェクト
            if (typeof triggerLightningEffect === 'function') {
                triggerLightningEffect();
            }

            // 雷が落ちた瞬間にビリビリを解除
            await new Promise(r => setTimeout(r, 300));
            if (targetEl) {
                targetEl.classList.remove('biribiri-active');
            }

            // カード破棄の最終処理
            await new Promise(r => setTimeout(r, 200));

            const target = board[pos.y][pos.x];
            if (target && !target.empty) {
                if (target.color) discardPile.push(target.color);
                if (target.stack) target.stack.forEach(c => discardPile.push(c));
                
                target.empty = true;
                target.revealed = false;
                target.stack = [];
                target.color = null;
                
                addLog(`神鳴：(${pos.x}, ${pos.y}) のカードを破壊しました。`);
                if (typeof renderBoard === 'function') renderBoard();
                if (typeof renderDeckAndDiscard === 'function') renderDeckAndDiscard();
            }

            if (onSuccess) onSuccess({});
        }, null, null, true, p, false, null, "おまかせ", null, p);
        return;
    }

    if (act.type === 'rich_whim_hand') { 
        startSelectionMode('select_cell', 2, 'place_deck_facedown', '山札から裏向きで置くマスを2つ選択', (selection) => {
            if (!selection || selection.length === 0) { if (onSuccess) onSuccess({}); return; }
            let idx = 0;
            const processNext = () => {
                if (idx >= selection.length) { if (onSuccess) onSuccess({}); return; }
                const pos = selection[idx];
                executeSelectionLogic('place_deck_facedown', [pos], () => {
                    const el = document.querySelector(`#board-grid > div:nth-child(${pos.y * GRID_SIZE + pos.x + 1})`);
                    if (el) el.classList.add('ring-4', 'ring-yellow-400', 'z-50', 'transition-all');
                    setTimeout(() => {
                        if (el) el.classList.remove('ring-4', 'ring-yellow-400', 'z-50');
                        idx++;
                        processNext();
                    }, 200);
                });
            };
            processNext();
        }, 7, null, true, p); 
        return; 
    }

    if (act.type === 'civil_path_hand') {
        const faceDownCards = [];
        for(let y=0; y<GRID_SIZE; y++) {
            for(let x=0; x<GRID_SIZE; x++) {
                const cell = board[y][x];
                if(!cell.empty && !cell.revealed) {
                    let isAroundOpponent = false;
                    players.forEach(pl => { if(pl.id === p.id) return; if(Math.abs(pl.x - x) <= 1 && Math.abs(pl.y - y) <= 1) isAroundOpponent = true; });
                    if(!isAroundOpponent) faceDownCards.push({x, y});
                }
            }
        }
        const emptyCells = board.flat().filter(c => c.empty);
        if (faceDownCards.length < 2 || emptyCells.length < 2) { showMessageOverlay("移動させるカード、または移動先の空きマスが足りません。", 2500, () => { if(onSuccess) onSuccess({}); }); return; }

        // 移動演出用の非同期関数
        const animateCivilPath = async (fromPosList, toPosList) => {
            const boardEl = document.getElementById('board-grid');
            
            for (let i = 0; i < fromPosList.length; i++) {
                const from = fromPosList[i];
                const to = toPosList[i];
                const fromIdx = from.y * GRID_SIZE + from.x;
                const toIdx = to.y * GRID_SIZE + to.x;
                
                const fromEl = boardEl.children[fromIdx];
                const toEl = boardEl.children[toIdx];
                
                const movingData = board[from.y][from.x];
                const cardData = movingData.color; // 一番上のカードを保持
                // stackData は移動させず、一番上のみを動かす

                // 1. 移動元の発光演出 (約1秒)
                if (typeof triggerCellFlash === 'function') {
                    triggerCellFlash(from.x, from.y, '#22c55e');
                }
                await new Promise(r => setTimeout(r, 1000));

                // 2. スライド移動の準備
                const cardImg = fromEl.querySelector('.card-back-pattern');
                if (!cardImg) continue;
                
                const rectFrom = fromEl.getBoundingClientRect();
                const rectTo = toEl.getBoundingClientRect();
                
                const clone = cardImg.cloneNode(true);
                clone.style.position = 'fixed';
                clone.style.top = rectFrom.top + 'px';
                clone.style.left = rectFrom.left + 'px';
                clone.style.width = rectFrom.width + 'px';
                clone.style.height = rectFrom.height + 'px';
                clone.style.zIndex = '1000';
                clone.style.transition = 'all 0.6s cubic-bezier(0.4, 0, 0.2, 1)';
                document.body.appendChild(clone);
                
                // 【外科手術的修正】一番上のみを抜き取り、スタックがあれば次を color に昇格させる
                if (movingData.stack && movingData.stack.length > 0) {
                    const nextCard = movingData.stack.shift(); // スタックから1枚取り出す
                    movingData.color = nextCard; // それをマスの表面（color）にする
                    // empty, revealed はそのまま維持
                } else {
                    // スタックがなければマスを空にする
                    movingData.empty = true;
                    movingData.color = null;
                    movingData.stack = [];
                }
                renderBoard();

                // 移動アニメーション開始
                requestAnimationFrame(() => {
                    clone.style.top = rectTo.top + 'px';
                    clone.style.left = rectTo.left + 'px';
                    clone.style.transform = 'scale(1.1)';
                });

                await new Promise(r => setTimeout(r, 650));

                // 3. 移動先にデータをセット（移動先は常に空マスなので、stackは空でセット）
                const destData = board[to.y][to.x];
                destData.empty = false;
                destData.color = cardData; // 抜き取った一番上のカード
                destData.revealed = false;
                destData.stack = []; // 移動先は空だったので、スタックは空
                
                clone.remove();
                renderBoard();

                // 4. 移動先の発光演出 (約1秒)
                if (typeof triggerCellFlash === 'function') {
                    triggerCellFlash(to.x, to.y, '#22c55e');
                }
                addLog(`民の道：カードを(${from.x},${from.y})から(${to.x},${to.y})へ移動。`);
                await new Promise(r => setTimeout(r, 1000));
            }
            if (onSuccess) onSuccess({});
        };

        // 1段階目：移動させるカードを選択
        startSelectionMode('select_cell', 2, 'civil_path_step1_dummy', '移動させる裏向きカードを2枚選択', (selectedFrom) => {
            // 2段階目：移動先を選択
            setTimeout(() => {
                startSelectionMode('select_cell', 2, 'civil_path_step2_dummy', '移動先の空きマスを選択', (selectedTo) => {
                    animateCivilPath(selectedFrom, selectedTo);
                }, null, null, true, p, false, null, "おまかせ", null, p);
            }, 300);
        }, null, null, true, p, false, null, "おまかせ", faceDownCards, p);
        return;
    }

    if (act.type === 'nanairo_no_ame') {
        const targets = [];
        // 到達効果は「空きマスのみ」が対象
        board.forEach((row, y) => row.forEach((cell, x) => { 
            if(cell.empty) targets.push({x, y}); 
        }));
        
        if (targets.length === 0) {
            if (onSuccess) onSuccess({});
            return;
        }

        // 演出を実行。第3引数のコールバックが「全アニメーション終了後」に実行される
        executeSelectionLogic('place_deck_sequential_rainbow', targets, (res) => {
            // ここで onSuccess を呼ぶことで、演出が終わってから獲得モーダルが出る
            if (onSuccess) onSuccess(res);
        });
        return;
    }

    else if (act.type === 'select_cell_outside') { startSelectionMode('select_cell_outside', act.count, act.logic, act.prompt, onSuccess, act.range, null, forceNoCancel, p, false, null, "おまかせ", null, p); return; }

    // --- 誰かの落とし物 (ID: 23) ---
    else if (act.type === 'lost_item_hand') {
        const enemyGates = players.filter(pl => pl.id !== p.id).map(pl => pl.startPos);
        startSelectionMode('select_cell', 1, 'lost_item_target', '配置する相手ゲートを1つ選択', (sel) => {
            const card = drawCard(); 
            if (card) {
                // ドローしたカードを表示してから手札に加える
                showCardModal(card, () => {
                    if (hands[p.id]) hands[p.id].push(card);
                    renderHand();
                    if (onSuccess) onSuccess({ stayOnBoard: true });
                }, "ドロー", p.name, "獲得しました");
            } else {
                if (onSuccess) onSuccess({ stayOnBoard: true });
            }
        }, null, null, true, null, false, null, "おまかせ", enemyGates, p);
        return;
    }

    else if (act.type === 'draw_reveal_seal') {
        const drawn = []; for(let i=0; i<act.value; i++){ const c = drawCard(); if(c) { c.sealed = true; c.isPublic = true; hands[p.id].push(c); drawn.push(c); } }
        if (drawn.length > 0) showCardModal(drawn, () => onSuccess({}), "ドロー＆公開", p.name, "情報開示を発動しました"); else onSuccess({}); return;
    }

    // --- 仕掛けられた罠 (ID: 26) ---
    else if (act.type === 'trapped_trap_hand') { 
    startSelectionMode('select_cell_outside', 1, 'trapped_trap_step1', "罠を設置するマスを選択してください（周囲以外）", (res) => {
        if (onSuccess) onSuccess({ stayOnBoard: true });
    }, null, null, true, p, false, null, "おまかせ", null, p); 
    return; 
    }

    else if (act.type === 'rainbow_fragment_choice') {
        const pHand = hands[p.id] || [];
        // 修正：手札にある「なないろの欠片」の総数をカウント
        const fragsInHand = pHand.filter(c => Number(c.id) === 29);
        const canDouble = fragsInHand.length >= 2; // 自分を含めて2枚以上必要

        const startFlow = () => {
            const choiceModal = document.createElement('div');
            choiceModal.className = "fixed inset-0 z-[250] flex items-center justify-center bg-black/80 backdrop-blur-sm px-4";
            choiceModal.innerHTML = `
                <div class="bg-gray-800 border-2 border-yellow-500 p-6 rounded-xl text-center shadow-2xl max-w-sm w-full">
                    <h3 class="text-white font-bold text-lg mb-2">なないろの欠片</h3>
                    <p class="text-gray-400 text-[10px] mb-4 text-left">使用する効果を選択してください</p>
                    <div class="flex flex-col gap-3">
                        <button id="btn-choice-single" class="bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-lg shadow-lg flex flex-col items-center">
                            <span>1枚ドロー</span>
                            <span class="text-[9px] font-normal opacity-70">（このカードを1枚捨てます）</span>
                        </button>
                        <button id="btn-choice-double" class="${canDouble ? 'bg-yellow-600 hover:bg-yellow-500 text-black cursor-pointer' : 'bg-gray-700 text-gray-500 cursor-not-allowed'} font-bold py-3 rounded-lg shadow-lg flex flex-col items-center relative overflow-hidden transition-colors">
                            <span>2枚ロック ＆ 2枚ドロー</span>
                            <span class="text-[9px] font-normal opacity-70">（欠片2枚を好きな場所1箇所にロック）</span>
                            ${!canDouble ? '<div class="absolute inset-0 bg-black/10 pointer-events-none"></div>' : ''}
                        </button>
                    </div>
                </div>`;
            document.body.appendChild(choiceModal);

            // --- ここから追加：自動処理時の挙動 ---
            if (isAutoAction) {
                setTimeout(() => {
                    // --- 修正箇所：ボタンをクリックする「前」にフラグをオフにする ---
                    isAutoAction = false; 
                    if (canDouble) {
                        choiceModal.querySelector('#btn-choice-double').click();
                    } else {
                        choiceModal.querySelector('#btn-choice-single').click();
                    }
                }, 600);
            }
            // --- ここまで ---

            choiceModal.querySelector('#btn-choice-single').onclick = () => {
                choiceModal.remove();
                const c = drawCard();
                if (c) {
                    showCardModal(c, () => {
                        hands[p.id].push(c);
                        if (typeof renderHand === 'function') renderHand();
                        onSuccess({});
                    }, "ドロー", p.name, "使用しました");
                } else onSuccess({});
            };

            if (canDouble) {
                choiceModal.querySelector('#btn-choice-double').onclick = () => {
                    choiceModal.remove();
                    const colorOptions = [...BASE_COLORS].reverse().filter(bc => {
                        const slot = collections[p.id][bc.id] || [];
                        return slot.length === 0 || slot.some(card => card.id === 34);
                    });

                    if (colorOptions.length === 0) {
                        if(typeof showToast === 'function') showToast("ロックできるスロットがありません");
                        onSuccess({}); return;
                    }

                    showSelectionModal("ロック先選択", "2枚をどの色としてロックしますか？", colorOptions, "card-back-pattern", 1, (sel) => {
                        // --- 修正箇所：ここでも念押しでフラグをオフにする（自動処理から呼ばれた際の保険） ---
                        isAutoAction = false; 
                        const targetColor = sel[0];
                        const tSlot = collections[p.id][targetColor.id];
                        
                        const curseIdx = tSlot.findIndex(c => c.id === 34);
                        if (curseIdx > -1) {
                            const curse = tSlot.splice(curseIdx, 1)[0];
                            addLog(`「なないろの欠片」の力で${targetColor.name}の呪いが解けました！`);
                            tempAction = { card: curse };
                            startSelectionMode('select_cell', 1, 'exile_curse_logic', '呪いを盤面へ追放してください', null, null, null, true, p, false, null, null, null, p);
                        }
                        
                        // 修正：手札から「自分以外の2枚目の欠片」を検索して取得
                        const secondIdx = hands[p.id].findIndex(c => Number(c.id) === 29 && c !== contextCard);
                        if (secondIdx === -1) { 
                            if(typeof showToast === 'function') showToast("エラー：2枚目の欠片が見つかりません");
                            onSuccess({}); return; 
                        }
                        const frag2 = hands[p.id].splice(secondIdx, 1)[0];
                        const frag1 = contextCard;

                        tSlot.push(frag1);
                        tSlot.push(frag2);

                        const drawn = [];
                        for (let k = 0; k < 2; k++) {
                            const c = drawCard();
                            if (c) { hands[p.id].push(c); drawn.push(c); }
                        }
                        
                        showCardModal(drawn, () => {
                            if (typeof checkWin === 'function') checkWin(p.id);
                            if (typeof renderStatus === 'function') renderStatus();
                            if (typeof renderHand === 'function') renderHand();
                            onSuccess({ stayOnBoard: true });
                        }, "ドロー", p.name, "使用しました");
                    }, false, () => {
                        // --- 修正箇所：キャンセル（戻る）ボタンが押された時もフラグをリセット ---
                        isAutoAction = false;
                        startFlow();
                    }, null, null, p);
                };
            }
        };
        startFlow(); return;
    }

    else if (act.type === 'greedy_choice') {
        const hasHand = (hands[p.id] || []).length > 0;
        if (!hasHand) {
            // 【修正箇所】showDetailModal を廃止し、showMessageOverlay を使用
            showMessageOverlay("手札がないため獲得のみ行い、\n元の場所へ戻ります。", 2500, () => {
                const targetCell = board[p.y][p.x];
                targetCell.revealed = false; 
                if(p.prevX !== -1 && (p.x !== p.prevX || p.y !== p.prevY)) {
                    p.x = p.prevX;
                    p.y = p.prevY;
                }
                updateGameState();
                onSuccess({});
            });
        } else {
            const msg = "手札を1枚捨てて獲得しますか？\n（「捨てない」を選択すると元の場所へ戻り、カード獲得します）";
            showDetailModal("欲しがりの吊り橋", msg, null, "１枚捨てる", () => {
            showSelectionModal("手札を捨てる", "捨てるカードを選択してください", hands[p.id], "card-back-pattern", 1, (sel) => { 
            sel.forEach(c => { 
            const curIdx = hands[p.id].indexOf(c); if(curIdx > -1) hands[p.id].splice(curIdx, 1); 
            discardPile.push(c); }); renderHand(); onSuccess({}); }, false, null, null, null, p); }); 
            const cnl = document.getElementById('detail-cancel-btn'); cnl.textContent = "捨てない"; cnl.onclick = () => { 
            const targetCell = board[p.y][p.x]; targetCell.revealed = false; 
            if(p.prevX !== -1 && (p.x !== p.prevX || p.y !== p.prevY)) { p.x = p.prevX; p.y = p.prevY; } 
            updateGameState(); onSuccess({}); closeDetailModal(); }; } return; } 
    
    else if (act.type === 'info_disclosure') {
        const targets = [{x:3, y:3}, {x:0, y:0}, {x:GRID_SIZE-1, y:0}, {x:0, y:GRID_SIZE-1}, {x:GRID_SIZE-1, y:GRID_SIZE-1}]; 
        const validTargets = targets.filter(t => !board[t.y][t.x].empty && !board[t.y][t.x].revealed);
        
        // 演出用の非同期関数
        const animateOpen = async (selectedPosList) => {
            if (typeof cancelSelection === 'function') cancelSelection(true);

            for (const pos of selectedPosList) {
                const targetCell = board[pos.y][pos.x];
                if (!targetCell || targetCell.empty || targetCell.revealed) continue;
                
                targetCell.revealed = true;
                addLog(`情報開示：(${pos.x}, ${pos.y}) をオープン。`);
                
                if (typeof renderBoard === 'function') renderBoard();
                if (typeof triggerCellFlash === 'function') {
                    triggerCellFlash(pos.x, pos.y, targetCell.color.hex || '#ffffff');
                }

                // 【重要】オープンしたマスにプレイヤーがいるか確認
                const pOnCell = players.find(pl => pl.x === pos.x && pl.y === pos.y);
                if (pOnCell) {
                    // 到達処理（モーダル）が終わるまでこのループを一時停止させる
                    await new Promise(resolve => {
                        handleArrivalLogic(targetCell, pOnCell, resolve, targetCell.color, false);
                    });
                } else {
                    // プレイヤーがいない場合は通常の待機時間
                    await new Promise(r => setTimeout(r, 800));
                }
            }
            if (onSuccess) onSuccess({});
        };

        if (validTargets.length > 0) { 
            // 第3引数のロジック名を 'open_facedown' から変更して自動処理との衝突を回避
            startSelectionMode('select_cell', validTargets.length, 'info_disclosure_animate', 'オープンする順番を選択してください（中央と四隅）', (sel) => {
                animateOpen(sel);
            }, null, null, forceNoCancel, p, false, null, "おまかせ", validTargets, p); 
        }
        else { 
            const allFaceDowns = []; 
            for(let y=0; y<GRID_SIZE; y++) { 
                for(let x=0; x<GRID_SIZE; x++) { 
                    const dx = Math.abs(p.x - x), dy = Math.abs(p.y - y); 
                    if (dx > 1 || dy > 1) { 
                        if (!board[y][x].empty && !board[y][x].revealed) allFaceDowns.push({x, y}); 
                    } 
                } 
            } 
            if (allFaceDowns.length > 0) { 
                // こちらも同様にロジック名を変更
                startSelectionMode('select_cell', 1, 'info_disclosure_animate', 'オープンする裏向きカードを1枚選択（自身の周囲以外）', (sel) => {
                    animateOpen(sel);
                }, null, null, forceNoCancel, p, false, null, "おまかせ", allFaceDowns, p); 
            } else { 
                addLog("オープンできるカードがありませんでした。"); 
                onSuccess({}); 
            } 
        }
        return;
    }
    
    else if (act.type === 'counter_arrival') {
        const minHand = Math.min(...players.map(pl => hands[pl.id].length));
        if (hands[p.id].length === minHand) {
            const drawn = []; 
            for(let i=0; i<2; i++) { 
                const c = drawCard(); 
                if(c) { hands[p.id].push(c); drawn.push(c); } 
            }
            
            showCardModal(drawn, () => { 
                if (hands[p.id].length > 0) { 
                    showSelectionModal("手札破棄", "捨てるカードを1枚選んでください", hands[p.id], "card-back-pattern", 1, (sel) => { 
                        hands[p.id].splice(hands[p.id].indexOf(sel[0]), 1); 
                        discardPile.push(sel[0]); 
                        onSuccess({}); 
                    }, false, null, null, null, p); 
                } else {
                    onSuccess({});
                }
            }, "反撃ドロー", p.name, "発動しました");
        } else { 
            addLog(`${p.name}の手札が最少ではないため、反撃は不発でした。`); 
            showMessageOverlay("手札が最少ではないため、\n反撃は発動しませんでした。", 2000, () => {
                onSuccess({}); 
            });
        } 
        return;
    }
    else if (act.type === 'favorite_flower_arrival') {
        const opponents = players.filter(pl => pl.id !== p.id);
        
        showSelectionModal("対象プレイヤー選択", "カードを渡す相手を選んでください", opponents.map(pl => ({id:pl.id, name:pl.name, type:"PLAYER_SELECT"})), "card-back-pattern", 1, (selPl) => {
            const victim = players.find(v => v.id === selPl[0].id);
            
            // 演出モーダルを表示
            showPresentFlowerModal(p, victim, contextCard, () => {
                // 演出終了後にカードを移動
                hands[victim.id].push(contextCard);

                const currentCell = board[p.y][p.x];
                if (currentCell.stack && currentCell.stack.length > 0) {
                    const nextCard = currentCell.stack.shift();
                    currentCell.color = nextCard;
                    currentCell.revealed = nextCard.savedRevealedState || false;
                    delete nextCard.savedRevealedState;
                    currentCell.empty = false;
                } else {
                    currentCell.empty = true;
                    currentCell.revealed = false;
                    currentCell.color = null;
                    currentCell.stack = [];
                }
                
                if (typeof renderBoard === 'function') renderBoard();

                if (isNewReveal) {
                    const c = drawCard();
                    if (c) {
                        hands[p.id].push(c);
                        showCardModal(c, () => onSuccess({ preventGain: true, stayOnBoard: true }), "ドロー", p.name, "花がオープンされたため1枚ドローしました");
                    } else {
                        onSuccess({ preventGain: true, stayOnBoard: true });
                    }
                } else {
                    addLog("既に表向きであったため、ドロー効果は発動しません。");
                    onSuccess({ preventGain: true, stayOnBoard: true });
                }
            });
        }, false, null, null, null, p);
        return;
    }
    if (onSuccess) onSuccess({});
}