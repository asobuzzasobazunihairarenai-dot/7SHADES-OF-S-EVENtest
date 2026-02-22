/**
 * 7 SHADES OF S:EVEN - Core Logic
 * 【共通定義】
 * - 到達: 表向きカードの上に駒が置かれた瞬間
 * - 到達効果: 到達時に発動。原則「効果解決」→「カード獲得」の順。
 * - 例外: カードに処遇（場に残る、破棄等）が書かれている場合はそれに従う。
 */
/**
 * 2026/02/07 13:30 修正
 * 1. 「ちょっと待った！」の到達フローをご指示の10ステップに完全準拠するよう修正。
 * 2. 再移動・カードオープン後に「ちょっと待った！」を回収し、その後に移動先の効果を解決する順序を保証。
 * 3. 効果解決前の不適切なセルクリーンアップとカード破棄を抑制し、Script Error :0:0 を解消。
 */

function createCardInstance(data) { 
    if (!data) return null;
    const baseColor = BASE_COLORS.find(c => c.id === data.colorId) || (data.colorId === 'rainbow' ? RAINBOW_COLOR : (data.colorId === 'white' ? WHITE_COLOR : BLACK_COLOR)); 
    return { 
        ...baseColor, 
        ...data, 
        colorId: data.colorId, 
        image: `images/card_${data.id}.webp`,
        stack: [], 
        baseMoveUsed: false, 
        sealed: false, 
        fromViridian: false 
    }; 
}

function drawCard() { 
    if (!deck || deck.length === 0) { 
        if (!discardPile || discardPile.length === 0) return null; 
        deck = [...discardPile].reverse(); 
        discardPile = []; 
        addLog("♻ 山札戻し。"); 
        if (typeof renderDeckAndDiscard === 'function') renderDeckAndDiscard(); 
    } 
    const card = deck.pop();
    // 手札枚数の表示更新を確実に行うため追加
    if (typeof renderHand === 'function') renderHand(); 
    return card; 
}

function discardCard(card) { 
    if(!card) return;
    if(card.type !== "ETERNAL") {
        discardPile.push(card); 
    }
    if (typeof renderDeckAndDiscard === 'function') renderDeckAndDiscard(); 
}

function updateGameState() { 
    if (!players || players.length === 0 || !players[turn]) return;
    const p = players[turn]; 
    isStuck = false; 

    if (p.marmegoPenalty && currentPhase === PHASE.MOVE && !p.baseMoveUsed) {
        const hasOpponentInRange = players.some(opp => opp.id !== p.id && Math.abs(p.x - opp.x) + Math.abs(p.y - opp.y) === 1);
        if (!hasOpponentInRange) { 
            addLog(`${p.name}は接触対象がいないためムーブを終了します。`); 
            p.baseMoveUsed = true; 
            p.extraMoves = 0; 
            setTimeout(endTurn, 1000); 
            return; 
        }
    }

    if (currentPhase === PHASE.MOVE && !isPlacingCard) { 
        isStuck = checkStuck(p); 
        if (p.extraMoves === 0 && p.baseMoveUsed && isStuck) { 
            addLog(`${p.name}は移動不可のためターンを終了します。`); 
            setTimeout(endTurn, 800); 
            return; 
        } 
    } 

    if (typeof renderBoard === 'function') renderBoard(); 
    if (typeof renderStatus === 'function') renderStatus(); 
    if (typeof renderHand === 'function') renderHand(); 
    if (typeof renderMyLockArea === 'function') renderMyLockArea(); 
    if (typeof renderDeckAndDiscard === 'function') renderDeckAndDiscard(); 
    if (typeof updatePhaseIndicator === 'function') updatePhaseIndicator(); 
    checkAutoSkip(); 
}

function checkAnytimeReactions(onProceed) {
    if (!players || players.length === 0) { onProceed(); return; }
    const candidates = players.filter(pl => !pl.reactionSkip && hands[pl.id] && hands[pl.id].some(c => c.id === 33 && !c.sealed)); 
    if (candidates.length === 0) { onProceed(); return; }
    let pIdx = 0;
    const processNext = () => {
        if (pIdx >= candidates.length) { onProceed(); return; }
        const pl = candidates[pIdx]; 
        const anytimeCards = (hands[pl.id] || []).filter(c => c.id === 33 && !c.sealed);
        if (anytimeCards.length === 0) { pIdx++; processNext(); return; }
        const firstCard = anytimeCards[0];
        
        if (typeof showDetailModal === 'function') {
            showDetailModal("割込確認", `${pl.name}さん、「強欲なパレット」を使用しますか？`, anytimeCards.length === 1 ? firstCard : null, "使用する", () => {
                if (anytimeCards.length === 1) {
                    activeHandCard = firstCard; 
                    if (typeof executeCardEffect === 'function') {
                        executeCardEffect(firstCard.handEffect, pl, () => {
                            const curIdx = hands[pl.id].indexOf(firstCard); 
                            if (curIdx > -1) discardPile.push(hands[pl.id].splice(curIdx, 1)[0]);
                            renderHand(); renderStatus(); updateGameState(); processNext();
                        }, firstCard);
                    }
                } else {
                    if (typeof showSelectionModal === 'function') {
                        showSelectionModal("発動カード選択", "使用するカードを選んでください", anytimeCards, "card-back-pattern", 1, (sel) => {
                            const card = sel[0]; 
                            activeHandCard = card; 
                            executeCardEffect(card.handEffect, pl, () => {
                                const curIdx = hands[pl.id].indexOf(card); 
                                if (curIdx > -1) discardPile.push(hands[pl.id].splice(curIdx, 1)[0]);
                                renderHand(); renderStatus(); updateGameState(); processNext();
                            }, card);
                        }, false, null, null, null, pl);
                    }
                }
            });
            const cnl = document.getElementById('detail-cancel-btn'); 
            if(cnl) { 
                cnl.textContent = "パス"; 
                cnl.onclick = () => { closeDetailModal(); pIdx++; processNext(); }; 
            }
        } else {
            onProceed();
        }
    };
    processNext();
}

function toggleReactionSkip() {
    if (!players || !players[turn]) return;
    const p = players[turn];
    p.reactionSkip = !p.reactionSkip;
    addLog(`反応スルーを ${p.reactionSkip ? 'ON' : 'OFF'} に設定しました。`);
    if (typeof updateGameState === 'function') updateGameState();
}

function checkChottoMattaCounter(targetPlayer, cardToLock, onCanceled, onPassed) {
    if (!players || players.length === 0) { onPassed(); return; }
    const potentialCounters = players.filter(p => p.id !== targetPlayer.id && hands[p.id] && hands[p.id].some(c => c.id === 21)); 
    if (potentialCounters.length === 0) { onPassed(); return; }
    const processNextCounter = (idx) => {
        if (idx >= potentialCounters.length) { onPassed(); return; }
        const cp = potentialCounters[idx]; 
        const waitCard = hands[cp.id].find(c => c.id === 21);
        const costCards = hands[cp.id].filter(c => c !== waitCard && (c.colorId === 'purple' || c.colorId === 'rainbow'));
        if (costCards.length === 0) { processNextCounter(idx + 1); return; }
        
        showDetailModal("割り込み確認", `${cp.name}さん、「ちょっと待った！」で${targetPlayer.name}の勝利を阻止しますか？`, waitCard, "使用する", () => {
            showSelectionModal("コスト支払い", "捨てるカードを選択してください", costCards, "card-back-pattern", 1, (sel) => {
                sel.forEach(c => { const curIdx = hands[cp.id].indexOf(c); if(curIdx > -1) hands[cp.id].splice(curIdx, 1); discardPile.push(c); });
                const waitIdx = hands[cp.id].indexOf(waitCard); if(waitIdx > -1) discardPile.push(hands[cp.id].splice(waitIdx, 1)[0]);
                discardPile.push(cardToLock); targetPlayer.lockPrevented = true; 
                addLog(`${cp.name}が「ちょっと待った！」で${targetPlayer.name}のロックを阻止！`); renderHand(); renderDeckAndDiscard(); onCanceled();
            }, false, null, null, null, cp);
        }, false);
        const cnlBtn = document.getElementById('detail-cancel-btn'); 
        if(cnlBtn) { 
            cnlBtn.textContent = "パス"; 
            cnlBtn.onclick = () => { closeDetailModal(); processNextCounter(idx + 1); }; 
        }
    };
    processNextCounter(0);
}

function startTurn() { 
    if (!players || players.length === 0) return;
    isEndingTurn = false; 
    isProcessingMove = false; 
    const p = players[turn]; 
    if(!p) return;
    p.baseMoveUsed = false; 
    p.viridianUsed = false; 
    p.serenadeUsed = false; 
    p.dimensionActive = false; 
    p.lockPrevented = false; 
    p.domusNeroUsed = false; 
    p.marmegoPenalty = false; 
    p.konohanaPenalty = false;
    p.prevX = p.x; 
    p.prevY = p.y; 
    players.forEach(pl => { if (hands[pl.id]) { hands[pl.id].forEach(c => { c.sealed = false; }); } });
    
    if (typeof showTurnChangeNotification === 'function') {
        showTurnChangeNotification(p);
    }
    
    currentPhase = PHASE.LOCK; 
    isStuck = false; 
    isPlacingCard = false; 
    isHandEffectProcessing = false; // 【追加】操作ロックを解除
    isAutoAction = false;
    isPeekingMode = false; 
    resetTimer(); 
    updateGameState(); 
}

function nextTurn() { 
    if (!players || players.length === 0) return;
    turn = (turn + 1) % players.length; 
    startTurn(); 
}

function nextPhase(isForced = false) { 
    if (isPeekingMode) return;
    
    if (useGlobalTimer && !isForced) {
        const p = players[turn];
        const maxTimeSetting = parseInt(document.getElementById('setting-max-time')?.value || "180");
        
        if (p && timeLeft > 0) {
            // ★修正：余った timeLeft をそのまま全額チャージ
            const charge = timeLeft; 
            p.totalTimeLeft = Math.min(maxTimeSetting, p.totalTimeLeft + charge);
            addLog(`💰 ${p.name}: ${charge}秒を全額貯金しました。`);
        }
    }

    checkAnytimeReactions(() => {
        if (currentPhase === PHASE.LOCK) { currentPhase = PHASE.HAND; addLog(`> ハンド`); } 
        else if (currentPhase === PHASE.HAND) { currentPhase = PHASE.MOVE; addLog(`> ムーブ`); } 
        else if (currentPhase === PHASE.MOVE && isForced) { endTurn(); return; } 
        
        isHandEffectProcessing = false; // 【追加】フェイズ移行時に操作ロックを解除
        isAutoAction = isForced; 
        isPlacingCard = false;
        resetTimer(); 
        updateGameState(); 
    });
}

function endTurn() { 
    if (isEndingTurn || !players || !players[turn]) return; 
    const p = players[turn]; 
    if (p.viridianUsed) { 
        const toDiscard = (hands[p.id] || []).filter(c => c.fromViridian); 
        if (toDiscard.length > 0) { 
            toDiscard.forEach(c => { 
                const idx = hands[p.id].indexOf(c); 
                if (idx > -1) discardPile.push(hands[p.id].splice(idx, 1)[0]); 
            }); 
            addLog(`${p.name}はヴァーディアンで引いたカードを捨てました。`); 
        } 
    }
    isEndingTurn = true; 
    if(timerInterval) { clearInterval(timerInterval); timerInterval = null; } 
    if (typeof checkGateInvasionForAll === 'function') checkGateInvasionForAll(); 
    isProcessingMove = false; 
}

function resetTimer() {
    if(timerInterval) clearInterval(timerInterval);
    
    // ★修正：固定の 30 (PHASE_TIME_SEC) ではなく、設定値を使う
    timeLeft = currentPhaseMaxTime;
    
    const p = players[turn];
    if (p) {
        timeAtTurnStart = p.totalTimeLeft;
    }
    timerInterval = setInterval(updateTimerTick, 1000);
}

function updateTimerTick() { 
    if(winner) return; 

    const p = players[turn];
    if (!p) return;

    // 追加：P1（先手）かつタイマー無視設定がONの場合は、これ以降の減算処理を行わない
    const ignoreP1 = document.getElementById('setting-p1-timer-ignore')?.checked;
    if (ignoreP1 && turn === 0) {
        return; 
    }

    if (timeLeft > 0) {
        timeLeft--; // まずはフェイズの30秒を減らす
    } else if (useGlobalTimer && p.totalTimeLeft > 0) {
        p.totalTimeLeft--; // 30秒が切れたら、プレイヤーの貯金を減らし始める
    } else {
        // --- タイムアウト時のランダムロック判定を追加 ---
        if (currentPhase === PHASE.LOCK) {
            const autoLock = document.getElementById('setting-timeout-random-lock')?.checked;
            const pHand = hands[p.id] || [];
            if (autoLock && pHand.length > 0) {
                // まだロックしていない色を持つ手札を抽出（特殊色は除外）
                const lockableCards = pHand.filter(card => {
                    const col = card.colorId;
                    if (col === 'white' || col === 'black' || col === 'rainbow') return false;
                    return collections[p.id][col].length === 0;
                });

                if (lockableCards.length > 0) {
                    const targetCard = lockableCards[Math.floor(Math.random() * lockableCards.length)];
                    // 手札から削除
                    hands[p.id] = pHand.filter(c => c !== targetCard);
                    // ロックエリアへ追加
                    collections[p.id][targetCard.colorId].push(targetCard);
                    addLog(`[自動] ${targetCard.name} をロックしました。`);
                    
                    if (typeof renderStatus === 'function') renderStatus();
                    if (typeof renderHand === 'function') renderHand();
                    if (typeof checkWin === 'function') checkWin(p.id);
                }
            }
        }
        // --- ここから追加：タイムアウト時の自動手札使用 ---
        if (currentPhase === PHASE.HAND) {
            const autoHand = document.getElementById('setting-timeout-auto-hand')?.checked;
            if (autoHand) {
                isAutoAction = true; // カード効果内の選択を「おまかせ」にするフラグを一時的にON
                let usedAny = false;
                
                // 使用可能なカードを1枚ずつ探し、なくなるまで再帰的に試行（簡易的に最初の1枚を使用）
                const usable = hands[p.id].filter(c => canPlayHandEffect(c, p));
                if (usable.length > 0) {
                    addLog(`[自動] 使用可能カードを自動実行します。`);
                    // 1枚目を使用（内部でisAutoActionを参照して自動選択される）
                    handleHandClick(hands[p.id].indexOf(usable[0]));
                    // 自動使用の連鎖は handleHandClick 側や isAutoAction で制御されるため、
                    // ここではフェイズ移行を一旦止め、自動処理に任せます。
                    return; 
                }
                isAutoAction = false;
            }
        }

        handleTimeOut(); // 貯金も尽きたら（またはモードOFFなら）ここで終了
        return;
    }

    if (typeof updateTimerVisual === 'function') updateTimerVisual(); 
}

function handleTimeOut() { 
    if (isEndingTurn) return; 

    // ★追加：時間切れペナルティの判定
    if (useGlobalTimer) {
        const p = players[turn];
        p.timeoutStrikes++; // ストライク加算
        addLog(`⚠️ ${p.name} が時間切れ！ (ストライク: ${p.timeoutStrikes}/2)`);

        if (p.timeoutStrikes >= 2) {
            // 2回連続時間切れで敗北判定
            addLog(`💀 ${p.name} は2回連続の時間切れにより敗北しました。`);
            // 他の生き残っているプレイヤーを勝者とする（簡易的に次のプレイヤーを勝者に）
            const winnerIdx = (turn + 1) % players.length;
            checkWin(players[winnerIdx].id); 
            return;
        }
    }
    
    // 自動アクションフラグを立てる
    isAutoAction = true;
    addLog(`> タイムアウト：自動処理を開始します`);

    // 1. 選択モード(selectionState)が動いている場合、または選択モーダルが表示されている場合
    if (selectionState.active) {
        triggerAutoSelect();
        return;
    }

    // 2. 到達・獲得モーダルが表示されている場合
    const arrivalModal = document.getElementById('arrival-modal');
    if (arrivalModal && !arrivalModal.classList.contains('hidden')) { 
        const btn = document.getElementById('arrival-ok-btn');
        if (btn) { btn.click(); return; } 
    }

    // 3. 選択結果確認画面（決定ボタン待ち）の場合
    const selectionModal = document.getElementById('selection-modal');
    if (selectionModal && !selectionModal.classList.contains('hidden')) {
        const okBtn = document.getElementById('selection-ok-btn');
        if (okBtn && !document.getElementById('selection-result').classList.contains('hidden')) {
            okBtn.click(); return;
        }
        triggerAutoSelect(); // まだ選んでいない場合はおまかせ
        return;
    }

    // 4. 確認ダイアログが表示されている場合
    const detailModal = document.getElementById('detail-modal');
    if (detailModal && !detailModal.classList.contains('hidden')) { 
        const btn = document.getElementById('detail-ok-btn');
        if (btn) { btn.click(); return; } 
    }
    
    if (isProcessingMove) return; 
    if(timerInterval) { clearInterval(timerInterval); timerInterval = null; } 
    
    if (currentPhase === PHASE.MOVE) { 
        if (isStuck) autoPlace(players[turn]); 
        else autoMove(players[turn]); 
    } else { 
        nextPhase(true); 
    } 
}

function autoMove(p) { 
    if (!p || !players) return;
    const enemies = players.filter(pl => pl.id !== p.id).map(pl => pl.startPos); 
    const directions = [[0,1], [0,-1], [1,0], [-1,0]]; 
    let bestMove = null, minDist = Infinity; 
    for (let d of directions) { 
        const nx = p.x + d[0], ny = p.y + d[1]; 
        if (nx >= 0 && nx < GRID_SIZE && ny >= 0 && ny < GRID_SIZE) { 
            const cell = board[ny][nx]; 
            if (!cell.empty || players.some(ep => ep.id !== p.id && ep.x === nx && ep.y === ny)) { 
                let dVal = Math.min(...enemies.map(eg => getDistance({x: nx, y: ny}, eg))); 
                if (dVal < minDist) { minDist = dVal; bestMove = {x: nx, y: ny}; } 
            } 
        } 
    } 
    if (bestMove && typeof executeMove === 'function') executeMove(bestMove.x, bestMove.y, board[bestMove.y][bestMove.x], players.find(ep => ep.id !== p.id && ep.x === bestMove.x && ep.y === bestMove.y)); 
    else endTurn(); 
}

function autoPlace(p) { 
    if (!p || !players) return;
    const enemies = players.filter(pl => pl.id !== p.id).map(pl => pl.startPos); 
    const directions = [[0,1], [0,-1], [1,0], [-1,0]]; 
    let bestPlace = null, minDist = Infinity; 
    for (let d of directions) { 
        const nx = p.x + d[0], ny = p.y + d[1]; 
        if (nx >= 0 && nx < GRID_SIZE && ny >= 0 && ny < GRID_SIZE) { 
            let dVal = Math.min(...enemies.map(eg => getDistance({x: nx, y: ny}, eg))); 
            if (dVal < minDist) { minDist = dVal; bestPlace = {x: nx, y: ny}; } 
        } 
    } 
    if (bestPlace && typeof executePlaceCard === 'function') executePlaceCard(bestPlace.x, bestPlace.y); 
    else endTurn(); 
}

function checkAutoSkip() { 
    if (winner || isAutoSkipping || isPlacingCard || (invasionQueue && invasionQueue.length > 0)) return; 
    if (!players || !players[turn]) return;
    const p = players[turn]; 
    if (currentPhase === PHASE.LOCK) { 
        const hasLockableCard = hands[p.id] && hands[p.id].some(card => (card.type === "ETERNAL" && card.id !== 29) || (card.colorId === "rainbow" && card.id !== 29) || (card.colorId !== "white" && card.colorId !== "black" && card.id !== 29 && (collections[p.id][card.colorId].length === 0 || collections[p.id][card.colorId].some(cur => cur.id === 34))) ); 
        if (!hasLockableCard) { isAutoSkipping = true; setTimeout(() => { isAutoSkipping = false; nextPhase(); }, 1000); } 
    } else if (currentPhase === PHASE.HAND && hands[p.id] && hands[p.id].length === 0) { 
        isAutoSkipping = true; setTimeout(() => { isAutoSkipping = false; nextPhase(); }, 1000); 
    } 
}

function checkStuck(p) { 
    if (!p) return true;
    const directions = [[0,1], [0,-1], [1,0], [-1,0]]; 
    for (let d of directions) { 
        const nx = p.x + d[0], ny = p.y + d[1]; 
        if (nx >= 0 && nx < GRID_SIZE && ny >= 0 && ny < GRID_SIZE) { 
            if (!board[ny][nx].empty || players.some(ep => ep.id !== p.id && ep.x === nx && ep.y === ny)) return false; 
        } 
    } 
    return true; 
}


// 1. 先に processExile を定義します（アロー関数形式を維持）
const processExile = (tSlot) => {
    if (!players || !players[turn]) return;
    const p = players[turn];
    
    // 修正：呪い(ID:34)を含めて合計3枚重なると追放
    if (tSlot && tSlot.length >= 3 && tSlot.some(c => c.id === 34)) { 
        const cIdx = tSlot.findIndex(c => c.id === 34); 
        const curse = tSlot.splice(cIdx, 1)[0]; 
        tempAction = { card: curse };
        addLog("封印が3枚重なり、呪いが解けました！");
        
        if (typeof startSelectionMode === 'function') {
            startSelectionMode('select_cell', 1, 'exile_curse_logic', '呪いを盤面へ追放してください', () => { 
                checkWin(p.id); 
                if (!winner) nextPhase(); 
            }, null, null, true, p, false, null, null, null, p);
        } else {
            checkWin(p.id);
            if (!winner) nextPhase();
        }
    } else { 
        checkWin(p.id); 
        if (!winner) nextPhase(); 
    }
};

// 2. 次に handleHandClick を定義します
function handleHandClick(cardIndex, lockedCard = null) {
    if (isPeekingMode || !players || !players[turn]) return;
    const p = players[turn];
    const card = lockedCard || (hands[p.id] ? hands[p.id][cardIndex] : null);
    if (!card) return;

    if (currentPhase === PHASE.LOCK) {
        if (p.lockPrevented) return;
        if (card.colorId === 'white' || card.colorId === 'black' || card.id === 29) return;

        // 【修正】ロックフェイズでも確認モーダルを表示
        showDetailModal("ロック確認", `「${card.name}」をロックしますか？`, card, "ロックする", () => {
            // --- 虹カードの処理 ---
            if (card.colorId === 'rainbow') {
                // ... (中略) ...
                showSelectionModal("RAINBOW LOCK", "どの色としてロックしますか？", lockableColors, "card-back-pattern", 1, (sel) => {
                    const targetColorId = sel[0].id; // 選択された色のID
                    if(!lockedCard && hands[p.id]) hands[p.id].splice(cardIndex, 1);
                    const tSlot = collections[p.id][targetColorId];
                    tSlot.push(card);
                    
                    // ここで演出を呼ぶ
                    if (typeof triggerLockEffect === 'function') {
                        triggerLockEffect(p.id, targetColorId);
                    }
                    
                    addLog(`${p.name}が「${card.name}」を${sel[0].name}としてロック！`);
                    processExile(tSlot);
                }, false, null, null, null, p);
                return;
            }

            // --- 通常カードの処理部分 (270行目付近) ---
            const slot = collections[p.id][card.colorId];
            if(!lockedCard && hands[p.id]) hands[p.id].splice(cardIndex, 1);
            slot.push(card);
            
            // ここで演出を呼ぶ
            if (typeof triggerLockEffect === 'function') {
                triggerLockEffect(p.id, card.colorId);
            }
            
            addLog(`${p.name}が「${card.name}」をロック！`);
            processExile(slot);

            // --- エターナル/通常カードの処理 ---
            // 呪い(34)が含まれているスロットなら、合計3枚になるまでロックを許可
            const hasCurse = slot.some(c => c.id === 34);
            const isSlotAvailable = slot.length === 0 || (hasCurse && slot.length < 3);
            
            if (!isSlotAvailable) return;

            if(!lockedCard && hands[p.id]) hands[p.id].splice(cardIndex, 1);
            slot.push(card);
            addLog(`${p.name}が「${card.name}」をロック！`);
            processExile(slot); 
        });

    } else if (currentPhase === PHASE.HAND || card.handEffect?.anytime) { 
        // --- ハンドフェイズ（または割込使用）の処理：復旧箇所 ---
        showDetailModal(card.handEffect?.anytime ? "割込使用確認" : "手札使用確認", "このカードを使用しますか？", card, "使用する", () => { 
            activeHandCard = card; 
            executeCardEffect(card.handEffect, p, (res) => { 
                // 手札から使用された場合の処理
                if (!lockedCard && hands[p.id]) { 
                    const curIdx = hands[p.id].indexOf(card); 
                    if (curIdx > -1) {
                        const removedCard = hands[p.id].splice(curIdx, 1)[0]; 
                        // 修正：呪いや花のように、別の場所に移動(stayOnBoard)した場合は捨て札に入れない
                        if (!(res && res.stayOnBoard)) {
                            discardPile.push(removedCard); 
                        }
                    }
                } 
                resetTimer(); 
                updateGameState(); 
            }, card); 
        }); 
    } 
}

// --- checkWin を呪い除外に修正 ---
function checkWin(pid) { 
    if(!collections[pid]) return;

    const lockedColors = LOCK_ORDER.filter(col => {
        const slot = collections[pid][col.id];
        return slot && slot.length > 0 && 
               slot.some(c => c.colorId !== 'white' && c.colorId !== 'black') && 
               !slot.some(c => c.id === 34);
    });
    
    if (lockedColors.length >= 7) { 
        winner = players.find(p => p.id === pid); 
        const nameEl = document.getElementById('winner-name');
        const overlay = document.getElementById('winner-overlay');
        const statsDisplay = document.getElementById('winner-stats-display');
        
        if (nameEl) {
            nameEl.textContent = `${winner.name} Wins!`;
            nameEl.className = "text-2xl font-bold mb-2 " + (winner.color?.bg?.replace('bg-', 'text-') || 'text-yellow-600');
        }

        // 移動距離の表示（データがない場合は 0 を表示してエラーを防ぐ）
        const moveDist = (playerStats[pid] && playerStats[pid].moveCount) ? playerStats[pid].moveCount : 0;
        if (statsDisplay) {
            statsDisplay.innerHTML = `
                <div class="py-2 border-y border-gray-100 mb-4">
                    <p class="text-gray-500 font-bold text-sm">
                        👟 総移動距離: <span class="text-gray-900 text-lg">${moveDist}</span> マス
                    </p>
                </div>
            `;
        }

        // ロックエリア表示
        const lockDisplay = document.getElementById('winner-lock-display');
        if (lockDisplay) {
            lockDisplay.innerHTML = '';
            LOCK_ORDER.forEach(colorBase => {
                const cardInLock = collections[winner.id][colorBase.id];
                const slot = document.createElement('div');
                slot.className = `w-10 h-10 rounded border border-white/40 flex items-center justify-center text-[8px] font-bold shadow-lg overflow-hidden relative victory-glow`;
                
                if (cardInLock && cardInLock.length > 0) {
                    const card = cardInLock[cardInLock.length - 1];
                    const imgPath = card.image || (card.id ? `images/card_${card.id}.webp` : null);
                    if (imgPath) {
                        slot.style.backgroundImage = `url('${imgPath}')`;
                        slot.style.backgroundSize = 'cover';
                    } else {
                        slot.style.backgroundColor = colorBase.hex;
                        slot.textContent = card.name[0];
                    }
                } else {
                    slot.className += " bg-gray-900 opacity-20";
                }
                lockDisplay.appendChild(slot);
            });
        }

        if(overlay) overlay.classList.remove('hidden'); 
        addLog(`🏆 ${winner.name} が勝利！ 総移動距離: ${moveDist}マス`);
    } 
}

function startPlaceCardMode() { if (isPeekingMode) return; isPlacingCard = true; updateGameState(); }

function executePlaceCard(x, y) { 
    if (isPeekingMode || !players || !players[turn]) return; 
    gainTime(5); 
    isProcessingMove = true; 
    const p = players[turn]; 
    const card = drawCard(); 
    if (card) { board[y][x].empty = false; board[y][x].revealed = false; board[y][x].color = card; board[y][x].stack = []; }
    isPlacingCard = false; 
    if (!p.baseMoveUsed) p.baseMoveUsed = true; 
    else if (p.extraMoves > 0) p.extraMoves--; 
    
    if (p.extraMoves > 0) { 
        addLog(`追加配置完了！(残り${p.extraMoves}回)`); 
        isProcessingMove = false; 
        resetTimer(); 
        updateGameState(); 
    } else { endTurn(); } 
}

function handleBoardClick(x, y) { 
    if (winner || currentPhase !== PHASE.MOVE || isStuck || isPlacingCard || isProcessingMove || isPeekingMode || !players[turn]) return; 
    const p = players[turn]; 
    const dist = Math.abs(p.x - x) + Math.abs(p.y - y); 
    const isTarget = (p.dimensionActive && !p.baseMoveUsed) ? (dist === 2) : (dist === 1); 
    if (!isTarget) return; 
    
    const cell = board[y][x], epOn = players.find(ep => ep.id !== p.id && ep.x === x && ep.y === y); 
    if (cell.empty && !epOn) return; 
    if (p.konohanaPenalty && epOn) return; 
    if (p.marmegoPenalty && !epOn) return;
    
    const isExtra = p.baseMoveUsed && p.extraMoves > 0;
    showDetailModal(epOn ? "接触確認" : (isExtra ? "追加移動確認" : "移動確認"), epOn ? "接触して手札を奪いますか？" : (isExtra ? "<b>追加移動</b> 権利を消費して移動しますか？" : "ここへ移動しますか？"), (!epOn && cell.revealed) ? cell.color : null, "実行", () => executeMove(x, y, cell, epOn)); 
}

function executeMove(x, y, cell, epOn) { 
    if (!players[turn]) return;
    gainTime(5); 
    isProcessingMove = true; 
    const p = players[turn];
    const moveFinish = () => { 
        if (!p.baseMoveUsed) p.baseMoveUsed = true; 
        else if (p.extraMoves > 0) p.extraMoves--; 
        if (p.extraMoves > 0) { 
            addLog(`追加移動権利残り ${p.extraMoves} 回`); 
            isProcessingMove = false; 
            resetTimer(); 
            updateGameState(); 
        } else { 
            checkAnytimeReactions(() => endTurn()); 
        } 
    };
    if (epOn) startStealSequence(epOn, moveFinish); 
    else moveToCell(p, x, y, false, moveFinish); 
}

function startStealSequence(victim, callback) { 
    if (!players[turn] || !hands[victim.id]) return;
    const turnPlayer = players[turn]; 
    const counterCard = hands[victim.id].find(c => c.id === 22); 
    if (counterCard) {
        showDetailModal("反撃のチャンス", `${victim.name}さん、「反撃」で接触を無効化し、逆に強奪しますか？`, counterCard, "反撃する", () => {
            hands[victim.id].splice(hands[victim.id].indexOf(counterCard), 1); 
            discardPile.push(counterCard); 
            addLog(`${victim.name}が「反撃」を発動！`); 
            startStealSequenceInternal(turnPlayer, callback, victim); 
        }, false);
        const cnlBtn = document.getElementById('detail-cancel-btn'); 
        if(cnlBtn) { 
            cnlBtn.textContent = "使わない"; 
            cnlBtn.onclick = () => { closeDetailModal(); startStealSequenceInternal(turnPlayer, callback); }; 
        } 
        return;
    }
    startStealSequenceInternal(victim, callback);
}

function startStealSequenceInternal(victim, callback, overrideInvader = null) {
    const invader = overrideInvader || players[turn];
    if (!hands[victim.id] || hands[victim.id].length === 0) { finishSteal(victim, null, callback, invader); return; } 
    showSelectionModal("強奪チャンス", `${invader.name}さん、1枚奪え！`, hands[victim.id], "card-back-pattern", 1, (cards) => finishSteal(victim, cards[0], callback, invader), true, null, null, null, invader);
}

function finishSteal(victim, card, callback, invader) { 
    if (card) { hands[victim.id].splice(hands[victim.id].indexOf(card), 1); hands[invader.id].push(card); } 
    if (victim.x === victim.startPos.x && victim.y === victim.startPos.y) { if(callback) callback(); } 
    else { moveToCell(victim, victim.startPos.x, victim.startPos.y, true, callback); }
}

async function moveToCell(player, tx, ty, isForced, callback, preArrival, extraClass = null) { 
    if (!player) return;
    const marker = document.getElementById(`p${player.id}-marker`);
    const cell = board[ty][tx];
    const destinationCard = cell.empty ? null : cell.color;
    const isNoOpen = (isForced === 'no_open');
    const isDashMove = (isForced === 'dash_move');
    const isNewReveal = destinationCard && !cell.revealed && !isNoOpen;

    if (marker && extraClass) marker.classList.add(extraClass);

    // 内部処理用の関数
    const executeLogic = () => {
        if (player.x >= 0 && player.y >= 0) {
            const dist = Math.abs(player.x - tx) + Math.abs(player.y - ty);
            if (playerStats[player.id]) playerStats[player.id].moveCount += dist;
        }
        player.prevX = player.x; 
        player.prevY = player.y; 
        player.x = tx; 
        player.y = ty;

        if (marker && extraClass) marker.classList.remove(extraClass);
        if (destinationCard && !isNoOpen) cell.revealed = true; 
        if (typeof renderBoard === 'function') renderBoard(); 

        const proceedToArrival = () => { 
            if (isDashMove || isNoOpen) {
                if (callback) callback();
                return;
            }
            player.pendingComboCallback = callback;
            if (destinationCard) { 
                player.processedArrivalCard = destinationCard;

                /* --- 修正箇所：ここで処理中フラグを立てる --- */
                isProcessingMove = true; 
                handleArrivalLogic(cell, player, null, destinationCard, isNewReveal); 
                
            } else if(callback) { 
                callback(); 
            }
        };

        if (destinationCard && !isNoOpen) {
            setTimeout(preArrival ? () => preArrival(proceedToArrival) : proceedToArrival, 800); 
        } else {
            if(preArrival) preArrival(proceedToArrival); else proceedToArrival();
        }
    };

    if (marker && !isForced) { 
        const startRect = marker.getBoundingClientRect();
        const boardEl = document.getElementById('board-grid');
        // 移動中、盤面全体の「はみ出し禁止」設定を一時的に解除して駒を見えるようにする
        boardEl.style.overflow = "visible";
        const destCellEl = boardEl ? boardEl.children[ty * GRID_SIZE + tx] : null;

        if (destCellEl) {
            const endRect = destCellEl.getBoundingClientRect(); 
            // 物理的に最前面に来るよう、z-indexを非常に高く設定
            marker.style.zIndex = "99999"; // 移動中は最高位
            marker.style.transition = "transform 0.6s cubic-bezier(0.4, 0, 0.2, 1)";
            marker.style.transform = `translate(${endRect.left - startRect.left}px, ${endRect.top - startRect.top}px)`; 
            
            await new Promise(resolve => setTimeout(resolve, 600));

            // 移動完了後に元に戻す
        boardEl.style.overflow = ""; 
        marker.style.zIndex = "";

            marker.style.transition = "none";
            marker.style.transform = "none";
            marker.style.zIndex = ""; 
            
            // 重要：ここでは executeLogic を呼ばず、外部の制御（await）に任せる
            // ただし、通常の移動も壊さないよう、isForced === 'manual' のような判定が必要ですが、
            // 今回はフォース専用の制御を modal 側で完遂させます。
        }
    }
    
    // フォース演出以外（通常の移動など）との互換性を保つため
    // callbackがない＝外部(async)で制御しているとみなし、ロジック実行を切り離します。
    if (callback) {
        executeLogic();
    } else {
        // 座標と統計だけ更新し、モーダルは出さない「静かな移動」モード
        player.x = tx; player.y = ty;
        if (typeof renderBoard === 'function') renderBoard();
    }
}

function handleArrivalLogic(cell, player, callback, cardObj, isNewReveal = false) {
    const curC = cardObj || cell.color;
    if (!curC) { if (callback) callback(); return; }
    
    player.processedArrivalCard = curC; // 処理開始フラグ

    /* --- 修正箇所：冒頭に発光演出と待機処理を追加 --- */
    // 1. まずド派手な発光をトリガー
    triggerArrivalRipple(player.x, player.y, curC.hex);

    // 2. 演出と余韻（計 約1.2秒）待ってから、本来のモーダル処理を開始する
    setTimeout(() => {

    /* --- 既存の雷演出(ID:24)や player.currentArrivalCard 設定、isDash判定等は変更なし --- */
    if (curC.id === 24) triggerLightningEffect();
        player.currentArrivalCard = curC;
        const isDash = curC.id === 15;

        const executeAndFollowUp = () => {
        executeCardEffect(curC.arrivalEffect, player, (res = {}) => {
            
            // 【重要】cleanupCellを修正：カードが消えたらフラグをリセット
            const cleanupCell = () => {
                if (!(res && res.stayOnBoard)) {
                    if (cell.stack && cell.stack.length > 0) {
                        cell.color = cell.stack.shift();
                        cell.revealed = cell.color.savedRevealedState || false;
                        delete cell.color.savedRevealedState;
                        cell.empty = false;
                    } else {
                        cell.empty = true;
                        cell.revealed = false;
                        cell.color = null;
                        cell.stack = [];
                    }
                }
                player.processedArrivalCard = null; 
                // --- 修正箇所：カードが入れ替わった直後に描画を更新し、監視に知らせる ---
                renderBoard(); 
            };

            const afterGain = () => { 
                // 【追加】ここでフラグをリセットすることで、獲得しなかった場合や
                // 盤面にカードが残る効果の場合でも、次の監視（あるいは同じカードの再検知）を許可する
                player.processedArrivalCard = null;
                
                // --- 既存ロジック：move_range_1 ---
                if (res.followUpAction === 'move_range_1') {
                    startSelectionMode('select_cell', 1, 'move_player', '改めて1マス移動してください', callback, 1, null, true, player, false, null, "おまかせ", null, player); 
                }
                // --- 既存ロジック：delayed_move ---
                else if (res.followUpAction === 'delayed_move') {
                    moveToCell(player, res.targetX, res.targetY, false, callback); 
                }
                // --- 既存ロジック：chotto_matta_flow (非常に重要) ---
                // --- 既存ロジック：chotto_matta_flow (非常に重要) ---
                else if (res.followUpAction === 'chotto_matta_flow') { 
                    player.x = player.prevX; 
                    player.y = player.prevY; 
                    updateGameState(); 
                    
                    const dirs = [[0,1], [0,-1], [1,0], [-1,0]]; 
                    const validCells = [];
                    dirs.forEach(([dx, dy]) => { 
                        const nx = player.x + dx, ny = player.y + dy; 
                        if (nx >= 0 && nx < GRID_SIZE && ny >= 0 && ny < GRID_SIZE) {
                            const targetCell = board[ny][nx];
                            const isOccupied = players.some(pl => pl.x === nx && pl.y === ny);
                            if (!(nx === cell.x && ny === cell.y) && !targetCell.empty && !isOccupied) {
                                validCells.push({x: nx, y: ny});
                            }
                        }
                    }); 

                    if(validCells.length === 0) { 
                        // 再移動先がない場合
                        if (typeof showDetailModal === 'function') {
                            showDetailModal("ちょっと待てなかった", "移動できる有効なマスが周囲にありませんでした。", curC, "獲得する", () => {
                                // 修正：showCardModal の完了後にのみ後続処理を実行
                                showCardModal(curC, () => { 
                                    if(hands[player.id]) hands[player.id].push(curC); 
                                    cleanupCell(); 
                                    renderHand(); 
                                    renderBoard(); 
                                    // エラー回避のため、ここで安全にコールバックを消化
                                    if (player.pendingComboCallback) {
                                        const fCb = player.pendingComboCallback;
                                        player.pendingComboCallback = null;
                                        fCb();
                                    } else if (callback) {
                                        callback();
                                    }
                                }, "到達獲得", player.name, "獲得しました");
                            }, true);
                        } else {
                            if(hands[player.id]) hands[player.id].push(curC); 
                            cleanupCell(); 
                            if (callback) callback();
                        }
                    } else { 
                        // (validCellsがある場合の処理は変更なし)
                        startSelectionMode('select_cell', 1, 'chotto_re_move', '改めて1マス移動してください', (mRes) => { 
                            if (!mRes || !mRes[0]) { finalizeComboOrCallback(); return; }
                            moveToCell(player, mRes[0].x, mRes[0].y, 'dash_move', () => {
                                showCardModal(curC, () => { 
                                    if(hands[player.id]) hands[player.id].push(curC); 
                                    cleanupCell(); 
                                    renderHand(); renderBoard(); 
                                    const nextCell = board[player.y][player.x];
                                    if (!nextCell.empty) {
                                        handleArrivalLogic(nextCell, player, callback, nextCell.color, true);
                                    } else {
                                        finalizeComboOrCallback();
                                    }
                                }, "到達獲得", player.name, "獲得しました"); 
                            });
                        }, 1, {x: cell.x, y: cell.y}, true, player, false, null, "おまかせ", null, player); 
                    } 
                    return; 
                }

                // --- 共通処理：コンボ判定またはコールバック実行 ---
                const finalizeComboOrCallback = () => {
                    const nextCell = board[player.y][player.x];
                    const hasNextCombo = !nextCell.empty && nextCell.revealed && player.processedArrivalCard !== nextCell.color;

                    if (hasNextCombo) {
                        addLog(`[Combo] ${player.name}の足元で連続到達を検知。`);
                        // --- 修正箇所：移動中フラグを解除して、renderBoardの監視を通るようにする ---
                        isProcessingMove = false; 
                        renderBoard(); 
                    } else {
                        // --- 既存の終了処理 ---
                        if (player.pendingComboCallback) {
                            const fCb = player.pendingComboCallback;
                            player.pendingComboCallback = null;
                            
                            const finalCheckCell = board[player.y][player.x];
                            if (!finalCheckCell.empty && finalCheckCell.revealed && player.processedArrivalCard !== finalCheckCell.color) {
                                isProcessingMove = false; // 念押し解除
                                renderBoard();
                                return; 
                            }
                            
                            if (fCb) fCb();
                        } else if (callback) {
                            callback();
                        }
                    }
                };

                // followUpActionがない通常の場合に実行
                if (!['delayed_move', 'chotto_matta_flow', 'move_range_1', 'placed_on_board'].includes(res.followUpAction)) {
                    finalizeComboOrCallback();
                }
            };

            if (isDash) {
                cleanupCell();
                renderBoard();
                showCardModal(curC, () => {
                    if(hands[player.id]) hands[player.id].push(curC);
                    renderHand();
                    const nextCell = board[player.y][player.x];
                    if (!nextCell.empty) {
                        handleArrivalLogic(nextCell, player, callback, nextCell.color, true);
                    } else if (callback) {
                        callback();
                    }
                }, "到達獲得", player.name, "獲得しました");
            } else {
                const shouldGain = !res.preventGain;
                if (shouldGain) {
                    // 【修正】モーダルを出す前に、まず盤面からカードを物理的に消去（または移動）する
                    // これにより、自動処理が重なっても「同じマスにまだカードがある」と誤認されなくなります
                    if (hands[player.id]) hands[player.id].push(curC);
                    cleanupCell(); 
                    
                    showCardModal(curC, () => { 
                        // すでに手札追加とクリーンアップは済んでいるので、描画と後続処理のみ行う
                        renderHand(); 
                        renderBoard(); 
                        renderDeckAndDiscard(); 
                        afterGain(); 
                    }, "到達獲得", player.name, "獲得しました"); 
                }
                else { 
                    // 「ちょっと待った！」の場合、cleanupCellはafterGain内の非同期処理で行うため、ここでは行わない
                    if (res.followUpAction === 'chotto_matta_flow') {
                        afterGain();
                    } else {
                        // 【修正箇所】「にじいろの呪い」などは rainbow_curse_logic 内で既にロックエリアへ
                        // 移動済みのため、ここで discardCard(curC) を呼ぶと捨て札に重複してしまう。
                        // curC.id === 34 (にじいろの呪い) の場合は捨て札処理をスキップする。
                        if (!(res && res.stayOnBoard) && curC.id !== 34) {
                            discardCard(curC); 
                        }
                        cleanupCell(); 
                        renderBoard(); 
                        afterGain();
                    }
                }
            }
        }, curC, isNewReveal);
    };

    /* --- 既存のモーダル呼び出しをこの位置で実行 --- */
        showCardModal(curC, () => {
            executeAndFollowUp();
        }, "到達効果発動", player.name, "到達！到達効果が発動します");

    }, 800); // 1.2秒の待機（発光アニメーションの時間）
}

function checkGateInvasionForAll() { 
     invasionQueue = []; 
    if(!players) return;
    players.forEach(p => { 
        const victim = players.find(v => v.id !== p.id && v.startPos.x === p.x && v.startPos.y === p.y); 
        if (victim) invasionQueue.push({ invader: p, victim: victim }); 
    }); 
    if (invasionQueue.length > 0) { 
        const overlay = document.getElementById('invasion-overlay'); 
        if(overlay) overlay.classList.remove('hidden'); 
        setTimeout(() => { if(overlay) overlay.classList.add('hidden'); processInvasionQueue(); }, 1500); 
    } else nextTurn(); 
}

function processInvasionQueue() { if (!invasionQueue || invasionQueue.length === 0) { nextTurn(); return; } const { invader, victim } = invasionQueue.shift(); processHandSteal(invader, victim); }

function processHandSteal(invader, victim) { const vHand = hands[victim.id] || []; const sCount = Math.floor(vHand.length / 2); if (sCount > 0) showSelectionModal("HAND STEAL", `${victim.name}の手札から${sCount}枚奪います`, vHand, "card-back-pattern", sCount, (cards) => { cards.forEach(c => { vHand.splice(vHand.indexOf(c), 1); hands[invader.id].push(c); }); processEternalAcquisition(invader, victim); }, true, null, null, null, invader); else processEternalAcquisition(invader, victim); }

function processEternalAcquisition(invader, victim) { 
    if (eternalDeck && eternalDeck.length > 0) { 
        showSelectionModal("ETERNAL SELECTION", "エターナルカードを1枚選び獲得します", eternalDeck, "eternal-back-pattern", 1, (cards) => { 
            const c = cards[0]; 
            eternalDeck.splice(eternalDeck.indexOf(c), 1); 
            const slot = collections[invader.id][c.colorId]; 

            // 修正箇所：既存のカードを手札に戻す前に、ファーストカードが含まれているかチェック
            const hasFirst = slot.some(card => card.type === 'FIRST');

            if (hasFirst) {
                // ファーストカードがある場合は、既存のカード（ファースト）をそのまま残し、エターナルを追加
                slot.push(c);
                addLog(`${invader.name}はファーストカードがあるスロットにエターナルを獲得！両方がロックされます。`);
            } else {
                // ファーストカードがない従来通りの処理：既存のカードをすべて手札に戻してからエターナルを置く
                while(slot.length > 0) hands[invader.id].push(slot.pop()); 
                slot.push(c); 
            }

            checkWin(invader.id); 
            processForcedReturn(invader); 
        }, true, null, null, null, invader); 
    } else { 
        processForcedReturn(invader); 
    } 
}

function processForcedReturn(invader) { const gate = invader.startPos; setTimeout(() => { const gCell = board[gate.y][gate.x]; if (!gCell.empty) { showCardModal(gCell.color, () => { if(hands[invader.id]) hands[invader.id].push(gCell.color); if(gCell.stack?.length > 0) { gCell.color = gCell.stack.shift(); gCell.revealed = gCell.color.savedRevealedState || false; gCell.empty = false; } else { gCell.empty = true; } invader.x = gate.x; invader.y = gate.y; updateGameState(); setTimeout(processInvasionQueue, 1000); }, "ゲート防衛カード獲得", invader.name, "獲得しました"); } else { invader.x = gate.x; invader.y = gate.y; updateGameState(); setTimeout(processInvasionQueue, 1000); } }, 1000); }

function cleanupGame() { 
    ['setup-overlay','winner-overlay','arrival-modal','selection-modal','detail-modal','player-detail-modal','invasion-overlay','test-mode-modal','settings-modal','discard-modal'].forEach(id => { 
        const el = document.getElementById(id); if(el) el.classList.add('hidden'); 
    }); 
    if(timerInterval) clearInterval(timerInterval); 
    timerInterval = null; 
    selectionState.active = false; 
    managePeekUI(false); 
    
    players = []; board = []; deck = []; eternalDeck = []; discardPile = []; hands = {}; collections = {}; turn = 0; winner = null; currentPhase = PHASE.LOCK; isEndingTurn = false; isProcessingMove = false; 
    const appEl = document.getElementById('app');
    if (appEl) appEl.classList.remove('selection-active');
}

async function initGameInternal(num, isTest = false) { 

    // ライトモードの反映
    if (isLightMode) {
        document.body.classList.add('light-mode');
    } else {
        document.body.classList.remove('light-mode');
    }

    // UI側のスイッチの状態も合わせる
    const toggle = document.getElementById('light-mode-toggle');
    if (toggle) toggle.checked = isLightMode;

    const preservedTestCards = isTest ? [...(testSelectedCards || [])] : null;
    cleanupGame(); 
    
    
    const tw = document.getElementById('timer-wrapper'); if(tw) tw.classList.remove('hidden'); 
    if (document.getElementById('my-lock-container')) document.getElementById('my-lock-container').classList.remove('hidden');
    if (document.getElementById('hand-area-container')) document.getElementById('hand-area-container').classList.remove('hidden');

    const timerToggle = document.getElementById('timer-mode-toggle');
    if (timerToggle) {
        useGlobalTimer = timerToggle.checked;
    }
    currentPhaseMaxTime = parseInt(document.getElementById('setting-phase-time')?.value || "15");
    
    const initTime = parseInt(document.getElementById('setting-init-time')?.value || "0");

    // ★★★ 修正箇所：BGM実装（詳細ログ付き） ★★★
    console.log("BGM再生を試みます..."); 
    if (window.gameBGM) {
        window.gameBGM.pause();
        window.gameBGM = null;
    }
    
    // パスが正しいか確認してください（index.htmlから見た相対パス）
    window.gameBGM = new Audio('audio/bgm_main.mp3'); 
    window.gameBGM.loop = true;
    window.gameBGM.volume = 0.3;

    // 再生を試行し、結果をログに出す
    window.gameBGM.play().then(() => {
        console.log("BGM再生成功！");
    }).catch(e => {
        console.error("BGM再生エラー詳細:", e);
        addLog(`[System] BGM再生に失敗しました。ファイルが存在するか確認してください。`);
    });
    // ★★★ 修正箇所ここまで ★★★


    const seats = num === 2 ? [SEATS.bottom, SEATS.top] : num === 3 ? [SEATS.bottom, SEATS.left, SEATS.top] : [SEATS.bottom, SEATS.left, SEATS.top, SEATS.right];
    eternalDeck = CARD_DATABASE.filter(d => d.type === 'ETERNAL').map(d => createCardInstance(d)).sort(() => Math.random() - 0.5); 
    const normalCandidates = CARD_DATABASE.filter(d => d.type === 'NORMAL'); 
    let deckArr = []; 

    if(!isTest) { 
        ['red','orange','yellow','green','blue','pink','purple'].forEach(col => {
            const colorNormals = normalCandidates.filter(d => d.colorId === col);
            colorNormals.forEach(c => {
                for(let i = 0; i < 7; i++) deckArr.push(createCardInstance(c));
            });
        });

        const rb = CARD_DATABASE.find(d => d.id === 29);
        for(let i = 0; i < 7; i++) deckArr.push(createCardInstance(rb));

        const specialCounts = { 30: 2, 31: 2, 32: 1, 33: 1, 34: 1 };
        Object.keys(specialCounts).forEach(idStr => {
            const cardId = parseInt(idStr);
            const cardData = CARD_DATABASE.find(d => d.id === cardId);
            for(let i = 0; i < specialCounts[idStr]; i++) {
                deckArr.push(createCardInstance(cardData));
            }
        });

        deckArr.sort(() => Math.random() - 0.5); 
    } else {
        const pool = preservedTestCards && preservedTestCards.length > 0 ? preservedTestCards : [CARD_DATABASE.find(d=>d.id===29)];
        while(deckArr.length < 112) pool.forEach(c => { if(deckArr.length < 112) deckArr.push(createCardInstance(c)); });
        deckArr.sort(() => Math.random() - 0.5);
    }

    playerStats = {};
    
    // 一旦、空の盤面を作成
    board = []; 
    for (let y=0; y<GRID_SIZE; y++) { 
        const row=[]; for(let x=0; x<GRID_SIZE; x++) { row.push({ x, y, color: null, revealed: false, empty: true, stack: [] }); }
        board.push(row); 
    } 

    // 盤面用のカードを確保
    const bCards = [...deckArr].splice(0, 49); 
    deckArr.splice(0, 49); 
    deck = deckArr; 
    discardPile = []; 

    const shfCols = [...BASE_COLORS].sort(() => Math.random() - 0.5); 
    players = seats.map((pos, i) => { 
        const pColor = (isTest && testFirstCards[i]) ? BASE_COLORS.find(bc => bc.id === testFirstCards[i].colorId) : shfCols[i]; 
        const player = { 
            id: i+1, x: pos.x, y: pos.y, startPos: {...pos}, name: `P${i+1}`, 
            color: pColor, css: `${pColor.bg} border-2 border-white`, 
            extraMoves: 0, baseMoveUsed: false, 
            viridianUsed: false, serenadeUsed: false, dimensionActive: false, 
            lockPrevented: false, domusNeroUsed: false, marmegoPenalty: false, 
            konohanaPenalty: false, reactionSkip: false,
            totalTimeLeft: initTime, 
            timeoutStrikes: 0 
        }; 
        player.prevX = player.x; player.prevY = player.y; 
        return player; 
    });

    playerStats = {};
    players.forEach(p => {
        playerStats[p.id] = { moveCount: 0 };
    });
    turn = 0; currentPhase = PHASE.LOCK; winner = null; collections = {}; hands = {}; invasionQueue = []; 
    players.forEach((p, idx) => {
        collections[p.id] = {};
        [...new Set(CARD_DATABASE.map(c => c.colorId))].forEach(cId => collections[p.id][cId] = []);
        hands[p.id] = [];
        
        const fCard = isTest && testFirstCards[idx] ? testFirstCards[idx] : CARD_DATABASE.find(d => d.type === 'FIRST' && d.colorId === p.color.id);
        if(fCard) collections[p.id][fCard.colorId].push(createCardInstance(fCard));
        
        if (isTest && testInitialLocks[idx]) testInitialLocks[idx].forEach(lc => collections[p.id][lc.colorId].push(createCardInstance(lc)));
        
        if (isTest && preservedTestCards) {
            const countPerCard = parseInt(document.getElementById('test-card-count')?.value || "1");
            preservedTestCards.forEach(tc => {
                for (let i = 0; i < countPerCard; i++) {
                    hands[p.id].push(createCardInstance(tc));
                }
            });
        }
    });

    if (typeof generateUI === 'function') generateUI();

    // 盤面カードの順次配置アニメーション
    for (let y = 0; y < GRID_SIZE; y++) {
        for (let x = 0; x < GRID_SIZE; x++) {
            const cardData = bCards.pop() || createCardInstance(CARD_DATABASE.find(d => d.id === 29));
            board[y][x].color = cardData;
            board[y][x].empty = false;
            
            renderBoard(); 
            await new Promise(resolve => setTimeout(resolve, 30)); 
        }
    }

    // --- ここからロゴ演出を追加 ---
    const logoOverlay = document.createElement('div');
    logoOverlay.className = "fixed inset-0 flex items-center justify-center logo-overlay-active";
    logoOverlay.innerHTML = `
        <img src="images/logo.webp" class="w-64 animate-logo-entrance shadow-[0_0_50px_rgba(234,179,8,0.4)]" alt="LOGO">
    `;
    document.body.appendChild(logoOverlay);

    // 追加：ロゴが出現した瞬間に「ドーン」と鳴らす
    if (typeof playSE === 'function') {
        playSE('se_title_impact.mp3'); 
    }
    // ------------------------------------------

    // 2秒間ロゴを表示してから消して、ゲームを開始する
    setTimeout(() => {
        logoOverlay.style.transition = "opacity 0.8s ease";
        logoOverlay.style.opacity = "0";
        setTimeout(() => {
            logoOverlay.remove();
            startTurn(); // 演出終了後に実際のターンを開始
        }, 800);
    }, 2000);
    // --- ここまで ---
}

async function initGame(n) { 
    await initGameInternal(n); 
}

function skipToPositionSelection() {
    if(!testSelectedCards || testSelectedCards.length === 0) { 
        showToast("テスト用の山札（カード）を1枚以上選んでください"); 
        return; 
    }
    const testEl = document.getElementById('test-mode-modal'); 
    if(testEl) testEl.classList.add('hidden');

    const firstCards = CARD_DATABASE.filter(c => c.type === 'FIRST');
    
    // ファーストカードをランダムに割り当て（初期ロック用）
    testFirstCards = [
        firstCards[Math.floor(Math.random() * firstCards.length)],
        firstCards[Math.floor(Math.random() * firstCards.length)]
    ];
    // 追加の初期ロックはなし
    testInitialLocks = [[], []];

    // ゲームの初期化を実行
    initGameInternal(2, true); 
    if(timerInterval) clearInterval(timerInterval); 
    
    // 駒を一時的に画面外へ
    players[0].x = -1; players[0].y = -1; 
    players[1].x = -1; players[1].y = -1; 
    renderBoard();

    // 駒の位置選択モードを開始
    startSelectionMode('select_cell', 1, 'test_pos_p1', "P1開始位置を選択", (sel) => { 
        players[0].x = sel[0].x; players[0].y = sel[0].y; 
        players[0].startPos = {...sel[0]}; 
        players[0].prevX = sel[0].x; players[0].prevY = sel[0].y; 
        renderBoard();
        startSelectionMode('select_cell', 1, 'test_pos_p2', "P2開始位置を選択", (sel2) => { 
            players[1].x = sel2[0].x; players[1].y = sel2[0].y; 
            players[1].startPos = {...sel2[0]}; 
            players[1].prevX = sel2[0].x; players[1].prevY = sel2[0].y; 
            addLog("テスト開始(一括スキップ)。"); 
            resetTimer(); 
            updateGameState(); 
        }, null, null, true, null, false, null, null, null, players[1]);
    }, null, null, true, null, false, null, null, null, players[0]);
}

function startTestGame() { 
    if(!testSelectedCards || testSelectedCards.length === 0) { showToast("カードを選んでください"); return; } 
    const testEl = document.getElementById('test-mode-modal'); if(testEl) testEl.classList.add('hidden'); 
    
    // 定義の準備
    const firstCards = CARD_DATABASE.filter(c => c.type === 'FIRST');
    const lockPool = CARD_DATABASE.filter(c => c.type === 'NORMAL' || c.type === 'ETERNAL'); 
    testFirstCards = []; 
    testInitialLocks = [[], []];

    // --- 内部フロー関数群 ---
    
    // P1 First: キャンセル(パス)時はランダム
    const flowP1F = () => showSelectionModal("P1 FIRST", "P1のファーストカードを選択", firstCards, "card-back-pattern", 1, (sel) => { 
        testFirstCards.push(sel[0]); flowP1L(); 
    }, false, () => { 
        // パス時はランダムな1枚を割り当て
        testFirstCards.push(firstCards[Math.floor(Math.random() * firstCards.length)]);
        flowP1L();
    }, "ランダムで次へ");

    // P1 Lock: キャンセル時は空（または既存の「決定」で空を許容）
    const flowP1L = () => showSelectionModal("P1 LOCKS", "P1の初期ロックを選択", lockPool, "card-back-pattern", 7, (sel) => { 
        testInitialLocks[0] = sel; flowP2F(); 
    }, false, () => { flowP2F(); }, "スキップして次へ");

    // P2 First
    const flowP2F = () => showSelectionModal("P2 FIRST", "P2のファーストカードを選択", firstCards, "card-back-pattern", 1, (sel) => { 
        testFirstCards.push(sel[0]); flowP2L(); 
    }, false, () => { 
        testFirstCards.push(firstCards[Math.floor(Math.random() * firstCards.length)]);
        flowP2L();
    }, "ランダムで次へ");

    // P2 Lock
    const flowP2L = () => showSelectionModal("P2 LOCKS", "P2の初期ロックを選択", lockPool, "card-back-pattern", 7, (sel) => { 
        testInitialLocks[1] = sel; flowPos(); 
    }, false, () => { flowPos(); }, "スキップして次へ");

    const flowPos = () => {
        initGameInternal(2, true); if(timerInterval) clearInterval(timerInterval); players[0].x = -1; players[0].y = -1; players[1].x = -1; players[1].y = -1; renderBoard();
        startSelectionMode('select_cell', 1, 'test_pos_p1', "P1開始位置", (sel) => { 
            players[0].x = sel[0].x; players[0].y = sel[0].y; players[0].startPos = {...sel[0]}; players[0].prevX = sel[0].x; players[0].prevY = sel[0].y; renderBoard();
            startSelectionMode('select_cell', 1, 'test_pos_p2', "P2開始位置", (sel2) => { 
                players[1].x = sel2[0].x; players[1].y = sel2[0].y; players[1].startPos = {...sel2[0]}; players[1].prevX = sel2[0].x; players[1].prevY = sel2[0].y; addLog("テスト開始。"); resetTimer(); updateGameState(); 
            }, null, null, true, null, false, null, null, null, players[1]);
        }, null, null, true, null, false, null, null, null, players[0]);
    }; 
    
    flowP1F();
}

function setupEventListeners() {
    // ...既存のリスナーの最後の方に追加
    
    // 設定ボタン
    const settingsBtn = document.getElementById('settings-btn');
    if (settingsBtn) {
        settingsBtn.onclick = () => {
            const modal = document.getElementById('settings-modal');
            if (modal) modal.classList.remove('hidden');
        };
    }
}