/**
 * 7 SHADES OF S:EVEN - game_core.js
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

/** 2026/03/09 修正：捨て札ログをより明確に（プレイヤー特定可能な場合は名前を出す） **/
function discardCard(card, player = null) { 
    if(!card) return;
    if(card.type !== "ETERNAL") {
        if (player) {
            addLog(`[${player.name}] が 『${card.name}』 を捨て札に送りました。`);
        } else {
            addLog(`『${card.name}』 が捨て札に送られました。`);
        }
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

    /**
 * 2026/03/06 修正
 * 「P1のみ手札表示」が有効な場合、P1以外のターンでは「配置モード」ボタンを強制的に非表示にする
 */
    if (typeof renderBoard === 'function') renderBoard(); 
    if (typeof renderStatus === 'function') renderStatus(); 
    if (typeof renderHand === 'function') renderHand(); 
    if (typeof renderMyLockArea === 'function') renderMyLockArea(); 
    if (typeof renderDeckAndDiscard === 'function') renderDeckAndDiscard(); 
    if (typeof updatePhaseIndicator === 'function') updatePhaseIndicator(); 

    // ★追加：配置モードボタンの表示制御
    const stuckBtn = document.getElementById('stuck-btn');
    if (stuckBtn) {
        // P1表示制限がON かつ 現在の手番がP1(index 0)ではない場合
        if (isP1HandOnlyView && turn !== 0) {
            stuckBtn.classList.add('hidden');
        }
    }

    checkAutoSkip(); 
}

function checkAnytimeReactions(onProceed) {
    if (!players || players.length === 0) { onProceed(); return; }
    const candidates = players.filter(pl => !pl.reactionSkip && hands[pl.id] && hands[pl.id].some(c => c.id === 33 && !c.sealed)); 
    if (candidates.length === 0) { onProceed(); return; }
    
    let pIdx = 0;
    const processNext = () => {
        if (pIdx >= candidates.length) { 
            // 全員の確認が終わったらタイマーを再開
            if (typeof resumeTimer === 'function') resumeTimer();
            onProceed(); 
            return; 
        }

        const pl = candidates[pIdx]; 
        
        // 人間（P1）が候補にいる場合、タイマーを一時停止
        if (pl.id === 1 && typeof pauseTimer === 'function') {
            pauseTimer(); 
        }

        const anytimeCards = (hands[pl.id] || []).filter(c => c.id === 33 && !c.sealed);
        if (anytimeCards.length === 0) { 
            pIdx++; 
            processNext(); 
            return; 
        }
        
        const firstCard = anytimeCards[0];
        
        if (typeof showDetailModal === 'function') {
            // ★ 外科手術：CPU（P2〜P4）の場合の思考ルーチン
            if (pl.id !== 1) {
                // AIに判断させる（NORMALモードなら状況に応じて、EASYなら確率で）
                let shouldInterrupt = false;
                if (autoMode === 'NORMAL') {
                    // 戦略的判断：相手がゴールに極めて近い、または自分が逆転を狙える時
                    const enemyNearGate = players.some(opp => {
                        const dist = Math.min(...players.filter(p => p.id !== opp.id).map(eg => getDistance({x: opp.x, y: opp.y}, eg.startPos)));
                        return dist <= 1; // 誰かがゴール直前なら割込！
                    });
                    shouldInterrupt = enemyNearGate || (Math.random() > 0.7); // 30%の確率、または危機的状況で発動
                } else {
                    shouldInterrupt = (Math.random() > 0.8); // EASYは20%の確率で気まぐれに発動
                }

                if (shouldInterrupt) {
                    addLog(`[Interrupt] ${pl.name} が「強欲なパレット」で割り込みます！`);
                    // モーダルを出さずに「使用する」の中身を直接実行
                    activeHandCard = firstCard; 
                    executeCardEffect(firstCard.handEffect, pl, () => {
                        const curIdx = hands[pl.id].indexOf(firstCard); 
                        if (curIdx > -1) discardPile.push(hands[pl.id].splice(curIdx, 1)[0]);
                        renderHand(); renderStatus(); updateGameState(); 
                        pIdx++; processNext();
                    }, firstCard);
                } else {
                    // パスする場合
                    pIdx++;
                    processNext();
                }
                return; // CPUはこのブロックで完結させる（画面を出さない）
            }

            // モーダルを表示
            showDetailModal("割込確認", `${pl.name}さん、「強欲なパレット」を使用しますか？`, anytimeCards.length === 1 ? firstCard : null, "使用する", () => {
                if (anytimeCards.length === 1) {
                    activeHandCard = firstCard; 
                    if (typeof executeCardEffect === 'function') {
                        executeCardEffect(firstCard.handEffect, pl, () => {
                            const curIdx = hands[pl.id].indexOf(firstCard); 
                            if (curIdx > -1) discardPile.push(hands[pl.id].splice(curIdx, 1)[0]);
                            renderHand(); renderStatus(); updateGameState(); 
                            pIdx++; // 次の候補へ
                            processNext();
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
                                renderHand(); renderStatus(); updateGameState(); 
                                pIdx++; // 次の候補へ
                                processNext();
                            }, card);
                        }, false, null, null, null, pl);
                    }
                }
            });

            // キャンセルボタン（パス）の挙動を上書き
            const cnl = document.getElementById('detail-cancel-btn'); 
            const okBtn = document.getElementById('detail-ok-btn'); // 「使用する」ボタン

            if(cnl && okBtn) { 
                // 1. ボタンの親要素（コンテナ）を Flexbox の折り返し設定にする
                const btnContainer = cnl.parentNode;
                btnContainer.className = "flex flex-wrap justify-center gap-2 mt-4"; 

                // 2. 既存ボタンのサイズ調整（「パス」と「使用する」を横並びに）
                cnl.textContent = "パス";
                cnl.className = "flex-1 min-w-[80px] py-2 text-xs bg-gray-700 border border-gray-500 rounded text-white";
                
                okBtn.className = "flex-1 min-w-[80px] py-2 text-xs bg-blue-600 border border-blue-400 rounded text-white font-bold";

                // 3. 「反応スルー」ボタンの生成と配置
                // すでにボタンがある場合は一旦削除（重複防止）
                const oldSkip = document.getElementById('detail-skip-all-btn');
                if(oldSkip) oldSkip.remove();

                const skipBtn = document.createElement('button');
                skipBtn.id = "detail-skip-all-btn";
                skipBtn.textContent = "今後の反応をスルー";
                // w-full で下に1行で配置、文字をさらに小さく
                skipBtn.className = "w-full py-1.5 text-[10px] bg-red-900/40 border border-red-700/50 rounded text-red-200 mt-1 opacity-80 hover:opacity-100 transition-opacity";
                
                // コンテナの最後に追加することで、下に配置される
                btnContainer.appendChild(skipBtn);

                // 各ボタンのクリックイベント
                cnl.onclick = () => { 
                    closeDetailModal(); 
                    pIdx++; 
                    processNext(); 
                };

                skipBtn.onclick = () => {
                    addLog(`${pl.name} は今後の反応をスルー設定にしました。`);
                    pl.reactionSkip = true; 
                    closeDetailModal();
                    pIdx++;
                    processNext();
                };
            }
        } else {
            // モーダル関数がない場合は次へ
            pIdx++;
            processNext();
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


async function startTurn() { 
    if (!players || players.length === 0) return;
    isEndingTurn = false; 
    isProcessingMove = false; 
    
    // 【外科手術的追加】タイマー対象を現在のターンプレイヤーに強制リセット
    if (typeof activeTimerPlayerId !== 'undefined') {
        activeTimerPlayerId = null; 
    }

    const p = players[turn]; 
    if(!p) return;

    // 変数リセット（ここは即座にやってOK）
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
    
    // --- 修正箇所：通知が終わるまで待機 ---
    if (typeof showTurnChangeNotification === 'function') {
        // await を付けることで、通知が消えるまで下の処理に進まなくなります
        await showTurnChangeNotification(p);
    }
    // ------------------------------------

    currentPhase = PHASE.LOCK; 
    isStuck = false; 
    isPlacingCard = false; 
    isHandEffectProcessing = false; 
    isAutoAction = false;
    isPeekingMode = false; 

    
    
    resetTimer(); // 演出が終わってからタイマー開始
    updateGameState(); // 演出が終わってから盤面更新・自動スキップ判定開始
}

function nextTurn() { 
    if (!players || players.length === 0) return;

    // ★追加：次の人へ回る前に、現在の盤面状況を記録
    recordLockHistory();

    turn = (turn + 1) % players.length; 
    // ★追加：ターン数を加算
    if (typeof totalTurnCount !== 'undefined') {
        totalTurnCount++;
    }
    usedOnceEffectsThisTurn = []; // ターンが変わったので制限をリセット
    phoenixExclusionList = [];    // ★追加：フェニックスの出禁リストを空にする
    startTurn(); 
}

let isPhaseTransitioning = false; // 【追加】二重移行防止フラグ

function nextPhase(isForced = false) { 
    if (isPeekingMode || isPhaseTransitioning) return; 
    isPhaseTransitioning = true; 

    // 【外科手術的追加】フェイズ移行時もタイマー固定を解除
    activeTimerPlayerId = null;
    
    if (useGlobalTimer && !isForced) {
        const p = players[turn];
        const maxTimeSetting = parseInt(document.getElementById('setting-max-time')?.value || "180");
        
        if (p && timeLeft > 0) {
            const charge = timeLeft; 
            p.totalTimeLeft = Math.min(maxTimeSetting, p.totalTimeLeft + charge);
            addLog(`💰 ${p.name}: ${charge}秒を全額貯金しました。`);
        }
    }

    checkAnytimeReactions(() => {
    if (currentPhase === PHASE.LOCK) { 
    currentPhase = PHASE.HAND; 
    addLog(`<span class="text-indigo-400 font-bold italic">⏳ [PHASE] HAND</span>`); 
    }
    else if (currentPhase === PHASE.HAND) { 
    currentPhase = PHASE.MOVE; 
    addLog(`<span class="text-indigo-400 font-bold italic">⏳ [PHASE] MOVE</span>`); 
    } 
    else if (currentPhase === PHASE.MOVE && isForced) { 
            isPhaseTransitioning = false; // 終了時は戻す
            endTurn(); return; 
        } 
        
        /** 2026/03/04 22:15 修正：フェイズ移行時に最新の補充時間設定を反映 **/
        isHandEffectProcessing = false; 
        isAutoAction = false; 
        isPlacingCard = false;

        // フェイズ移行時の制限時間設定
        // CPU戦モード(FORCED_CPU_MODE)なら1秒、それ以外は設定画面の「基本秒数」を維持する
        if (window.FORCED_CPU_MODE) {
            window.currentPhaseMaxTime = 1; 
        } else {
            // 設定画面の「基本秒数(setting-phase-time)」を再取得
            const pTimeEl = document.getElementById('setting-phase-time');
            window.currentPhaseMaxTime = pTimeEl ? parseInt(pTimeEl.value) : 15;
        }

        resetTimer(); 
        updateGameState(); 

        // 0.5秒後にフラグを解除。これにより、補充時間0秒でも
        // タイマーの「次の1秒」が来るまで次の強制移行を受け付けないようにします。
        setTimeout(() => { isPhaseTransitioning = false; }, 500);
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

/**
 * 2026/03/11 修正
 * 1. タイムアウト時の自動ロック処理を handleHandClick 経由に変更し、割り込み検問を有効化。
 * 2. 構文エラー（カッコの不整合）を解消。
 */
function updateTimerTick() { 
    if(winner || isTimerPaused) return;

    const selectionModal = document.getElementById('selection-modal');
    const isSelectionActive = selectionState.active || (selectionModal && !selectionModal.classList.contains('hidden'));

    if (!isSelectionActive) {
        if (isAutoProcessing || isHandEffectProcessing || isProcessingMove || activeModalId) return;
    }

    const p = activeTimerPlayerId 
        ? players.find(pl => pl.id === activeTimerPlayerId) 
        : players[turn];
        
    if (!p) return;

    const ignoreP1 = document.getElementById('setting-p1-timer-ignore')?.checked;
    if (ignoreP1 && p.id === 1) { 
        return; 
    }

    if (timeLeft > 0) {
        timeLeft--; 
    } else if (useGlobalTimer && p.totalTimeLeft > 0) {
        p.totalTimeLeft--; 
    } else {
        if (isAutoProcessing) return;

        if (currentPhase === PHASE.LOCK) {
            const autoLock = document.getElementById('setting-timeout-random-lock')?.checked;
            const pHand = hands[p.id] || [];
            if (autoLock && pHand.length > 0) {
                isAutoProcessing = true; 

                let lockableCards = pHand.filter(card => {
                    const col = card.colorId;
                    if (col === 'white' || col === 'black' || col === 'rainbow') return false;
                    return collections[p.id][col].length === 0;
                });

                let targetCard = null;
                if (lockableCards.length > 0) {
                    if (autoMode === 'NORMAL') {
                        const colorCounts = {};
                        lockableCards.forEach(card => {
                            colorCounts[card.colorId] = (colorCounts[card.colorId] || 0) + 1;
                        });
                        const minCount = Math.min(...Object.values(colorCounts));
                        const rarestColorIds = Object.keys(colorCounts).filter(id => colorCounts[id] === minCount);
                        const targetColorId = rarestColorIds[Math.floor(Math.random() * rarestColorIds.length)];
                        targetCard = lockableCards.find(card => card.colorId === targetColorId);
                    } else {
                        targetCard = lockableCards[Math.floor(Math.random() * lockableCards.length)];
                    }
                }

                if (targetCard) {
                    // ★ 修正：直接ロックせず、検問所を通る handleHandClick へ
                    const targetIdx = hands[p.id].indexOf(targetCard);
                    addLog(`[System] ${p.name}のタイムアウト：自動ロックを試みます...`);
                    isAutoAction = true;
                    handleHandClick(targetIdx);
                    return; // ここで一旦終了（handleHandClick 側で検問が始まる）
                }
                isAutoProcessing = false;
            }
        }
        
        if (currentPhase === PHASE.HAND) {
            const autoHand = document.getElementById('setting-timeout-auto-hand')?.checked;
            if (autoHand) {
                if (isAutoProcessing || isHandEffectProcessing || isSelectionActive || activeModalId) {
                    handleTimeOut(); return;
                }

                const lockCards = [];
                LOCK_ORDER.forEach(color => {
                    const slot = collections[p.id][color.id];
                    if (slot && slot.length > 0) {
                        const topC = slot[slot.length - 1];
                        if (topC.type === "FIRST" || topC.type === "ETERNAL") {
                            lockCards.push(topC);
                        }
                    }
                });

                const allCandidates = [...hands[p.id], ...lockCards];
                const usable = allCandidates.filter(c => {
                    if (!canPlayHandEffect(c, p)) return false;
                    if (autoMode === 'NORMAL') {
                        if (c.fromViridian) return true;
                        const col = c.colorId;
                        const isBasicColor = ['red', 'orange', 'yellow', 'green', 'blue', 'pink', 'purple'].includes(col);
                        if (isBasicColor) {
                            const slot = collections[p.id][col];
                            const isNotLocked = !slot || slot.length === 0 || (slot.length === 1 && slot[0].id === 34);
                            if (isNotLocked) return false; 
                        }
                        const harmfulAgainstTop = [30, 32, 34];
                        if (harmfulAgainstTop.includes(c.id)) {
                            const lockCounts = players.map(pl => {
                                return LOCK_ORDER.filter(colorBase => {
                                    const s = collections[pl.id][colorBase.id];
                                    return s && s.length > 0 && !s.some(card => card.id === 34);
                                }).length;
                            });
                            const maxLocks = Math.max(...lockCounts);
                            const myLocks = lockCounts[players.indexOf(p)];
                            if (myLocks === maxLocks) return false;
                        }
                    }
                    return true;
                });

                if (usable.length > 0) {
                    usable.sort((a, b) => (b.fromViridian ? 1 : 0) - (a.fromViridian ? 1 : 0));
                    const targetCard = usable[0];
                    isAutoProcessing = true; 
                    isAutoAction = true; 
                    const handIdx = hands[p.id].indexOf(targetCard);
                    if (handIdx !== -1) handleHandClick(handIdx);
                    else handleHandClick(-1, targetCard);
                    return;
                }
                isAutoAction = false;
            }
        }
        handleTimeOut(); 
        return;
    }

    if (typeof updateTimerVisual === 'function') updateTimerVisual(); 
}

function handleTimeOut() { 
    if (isEndingTurn || winner) return; 


    const selectionModal = document.getElementById('selection-modal');
    const arrivalModal = document.getElementById('arrival-modal');
    const stealActionModal = document.getElementById('steal-action-modal');
    // もし今表示されているのが「割込確認」で、かつ対象が P1 なら何もしない
    const detailModal = document.getElementById('detail-modal');
    if (detailModal && !detailModal.classList.contains('hidden')) {
        const title = document.getElementById('detail-title')?.textContent;
        if (title === "割込確認" && actingP && actingP.id === 1) {
            return; // 人間の思考時間なので、自動クリックを阻止
        }
    }

    // 現在の実行対象プレイヤー（相手プレイヤーを含む）を特定
    const actingP = activeTimerPlayerId 
        ? players.find(pl => pl.id === activeTimerPlayerId) 
        : players[turn];

    // 選択画面（盤面マス選択 または カード等のアイテム選択）が出ているか判定
    const isSelectionActive = selectionState.active || (selectionModal && !selectionModal.classList.contains('hidden'));

    // 1. 【最優先】スティールなどの演出用モーダルをスキップ
    if (stealActionModal && !stealActionModal.classList.contains('hidden')) {
        addLog(`> タイムアウト：${actingP.name}が演出をスキップします`);
        stealActionModal.click(); 
        return;
    }

    // 2. ガード条件（選択待ちでない場合のみ、他の処理が終わるのを待つ）
    if (!isSelectionActive) {
        if (isAutoProcessing || isHandEffectProcessing || isProcessingMove || (invasionQueue && invasionQueue.length > 0) || activeModalId) {
            if (autoProcessTimeout) clearTimeout(autoProcessTimeout);
            autoProcessTimeout = setTimeout(handleTimeOut, 500); 
            return;
        }
    }

    // ここまで来たら自動アクション実行
    isAutoAction = true;
    addLog(`> タイムアウト：${actingP.name}の自動処理を開始します`);

    // 3. 選択待ちモーダル（強奪チャンス、気まぐれ配置、エターナル獲得等）への対応
    if (isSelectionActive) {
        const okBtn = document.getElementById('selection-ok-btn');
        const resArea = document.getElementById('selection-result');

        // A. 既に決定画面（結果確認）ならOKボタンを押す
        if (okBtn && resArea && !resArea.classList.contains('hidden')) {
            okBtn.click();
            return;
        }

        // B. カード選択モーダル内の選択肢（selection-option）がある場合
        if (selectionModal && !selectionModal.classList.contains('hidden')) {
            const options = Array.from(document.querySelectorAll('.selection-option'));
            // まだ選択されていない（光っていない）選択肢を抽出
            const unselected = options.filter(opt => !opt.classList.contains('selected-card-glow'));
            if (unselected.length > 0) {
                // ランダムに1つ選んでクリック（複数枚選択が必要な場合も、毎秒クリックされることで解決）
                unselected[Math.floor(Math.random() * unselected.length)].click();
                return;
            }
        }

        // C. 盤面マス選択モード（selectionState）が有効ならそちらを実行
        if (selectionState.active) {
            triggerAutoSelect();
        }
        return;
    }

    // 4. 到達獲得・ドロー確認・詳細確認を閉じる
    if (arrivalModal && !arrivalModal.classList.contains('hidden')) { 
        const btn = document.getElementById('arrival-ok-btn');
        if (btn) { btn.click(); return; } 
    }
    if (detailModal && !detailModal.classList.contains('hidden')) { 
        const btn = document.getElementById('detail-ok-btn');
        if (btn) { btn.click(); return; } 
    }
    if (detailModal && !detailModal.classList.contains('hidden')) { 
        const btn = document.getElementById('detail-ok-btn'); // 「横一列」を優先選択
        if (btn) { btn.click(); return; } 
    }
    
    // 5. フェイズ進行の自動化
    if (isProcessingMove || isHandEffectProcessing) return; 
    if(timerInterval) { clearInterval(timerInterval); timerInterval = null; } 
    
    if (currentPhase === PHASE.MOVE) { 
        if (isStuck) autoPlace(players[turn]); 
        else autoMove(players[turn]); 
    } else { 
        if (isAutoProcessing) return; 
        nextPhase(true); 
    }
}

/**
 * 2026/03/03 修正
 * autoMove内の評価ロジックを AI_SCORE_CONFIG 連動型にアップデート
 */
function autoMove(p) { 
    if (!p || !players || isProcessingMove || isHandEffectProcessing) return;
    const enemyGatePos = players.filter(pl => pl.id !== p.id).map(pl => pl.startPos); 
    const otherPlayers = players.filter(pl => pl.id !== p.id);
    
    const moveRange = (p.dimensionActive && !p.baseMoveUsed) ? 2 : 1;
    const directions = [[0, 0], [0, moveRange], [0, -moveRange], [moveRange, 0], [-moveRange, 0]]; 
    
    // ★外科手術1：欠落していたスコア設定の補完（MOVE_TOWARD_GATE を追加）
    const cfg = window.AI_SCORE_CONFIG || {
        CARD_COUNT: 10, UNLOCKED_COLOR: 50, ADJACENT_ENEMY: 5,
        SELF_GATE_DEFENSE: 20, APPROACH_ENEMY_GATE: 20, REACH_ENEMY_GATE: 100,
        MOVE_TOWARD_GATE: 30, // ←ここが抜けていたため NaN になっていた可能性が高い
        RARE_COLOR: 20, POWER_CARD_NEAR: 20, STEAL_ACTION: 50,
        STACK_COUNT: 10 // これも追加
    };

    let bestMoves = [];
    let maxScore = -Infinity;

    // ★念のため：autoMode が未定義なら NORMAL に強制設定（テストモード対策）
    const currentAutoMode = (typeof autoMode !== 'undefined') ? autoMode : 'NORMAL';

    for (let d of directions) { 
        const nx = p.x + d[0], ny = p.y + d[1]; 
        if (nx < 0 || nx >= GRID_SIZE || ny < 0 || ny >= GRID_SIZE) continue;

        const isStaying = (d[0] === 0 && d[1] === 0);
        if (!isStaying && !(p.extraMoves > 0) && nx === p.startPos.x && ny === p.startPos.y) {
            continue;
        }

        const cell = board[ny][nx];
        const epOn = otherPlayers.find(ep => ep.x === nx && ep.y === ny);
        const isSelectable = isStaying || !cell.empty || epOn;

        if (isSelectable) { 
            let score = 0;
            if (currentAutoMode === 'NORMAL') {
                try {
                    const currentDistToGate = Math.min(...enemyGatePos.map(eg => getDistance({x: p.x, y: p.y}, eg)));
                    const nextDistToGate = Math.min(...enemyGatePos.map(eg => getDistance({x: nx, y: ny}, eg)));

                    if (nextDistToGate === 0 && currentDistToGate <= 1) score += (cfg.REACH_ENEMY_GATE || 100);
                    if (nextDistToGate < currentDistToGate) score += (cfg.MOVE_TOWARD_GATE || 30);
                    if (epOn) score += (cfg.STEAL_ACTION || 50); 

                    if (!cell.empty && cell.revealed && cell.color) {
                        const colId = cell.color.colorId;
                        if (cell.color.isNegativeArrival) score -= 80;
                        if (collections[p.id][colId] && collections[p.id][colId].length === 0) score += (cfg.UNLOCKED_COLOR || 50);
                        if (['rainbow', 'white', 'black'].includes(colId)) score += (cfg.RARE_COLOR || 20);
                    }
                    
                    const stackCount = (cell.stack ? cell.stack.length : 0) + (cell.empty ? 0 : 1);
                    score += Math.max(1, stackCount * (cfg.STACK_COUNT || cfg.CARD_COUNT || 10));

                    if (isStaying) {
                        const isAtEnemyGate = enemyGatePos.some(eg => eg.x === p.x && eg.y === p.y);
                        if (isAtEnemyGate) score += 500; 
                    }

                } catch (e) {
                    console.error("AI Scoring Error:", e);
                    score = 1;
                }
            } else {
                const distToGate = Math.min(...enemyGatePos.map(eg => getDistance({x: nx, y: ny}, eg)));
                score = (100 - distToGate);
            }

            if (score > maxScore) {
                maxScore = score;
                bestMoves = [{x: nx, y: ny, cell, epOn}];
            } else if (score === maxScore) {
                bestMoves.push({x: nx, y: ny, cell, epOn});
            }
        }
    } 
    
    const move = bestMoves.length > 0 ? bestMoves[Math.floor(Math.random() * bestMoves.length)] : null;

    if (move && typeof executeMove === 'function') {
        executeMove(move.x, move.y, move.cell, move.epOn); 
    } else {
        // ★外科手術2：移動できない場合は、ムーブを終了せず配置モード(autoPlace)へ繋ぐ
        addLog(`${p.name}は移動可能な場所がないため、配置に切り替えます。`);
        if (typeof autoPlace === 'function') {
            autoPlace(p);
        } else {
            isProcessingMove = false;
            isAutoAction = false;
            endTurn();
        }
    }
}

/**
 * 2026/03/03 修正
 * autoPlace を AI_SCORE_CONFIG 連動のスコアリング方式にアップデート
 */
function autoPlace(p) { 
    if (!p || !players || isProcessingMove || isHandEffectProcessing) return;
    
    const enemyGatePos = players.filter(pl => pl.id !== p.id).map(pl => pl.startPos); 
    const otherPlayers = players.filter(pl => pl.id !== p.id);
    const directions = [[0,1], [0,-1], [1,0], [-1,0]]; 
    
    const cfg = window.AI_SCORE_CONFIG || {
        APPROACH_ENEMY_GATE: 20, REACH_ENEMY_GATE: 100, SELF_GATE_DEFENSE: 20
    };

    let bestPlaces = [];
    let maxScore = -Infinity;

    for (let d of directions) { 
        const nx = p.x + d[0], ny = p.y + d[1]; 
        if (nx < 0 || nx >= GRID_SIZE || ny < 0 || ny >= GRID_SIZE) continue;
        
        // 配置なので、そこが空いているかチェック（基本ルール）
        if (board[ny][nx].empty) {
            let score = 0;
            
            /**
 * 2026/03/06 修正
 * autoPlace を最新の評価基準（敵ゲート攻め+30、防衛+20）にアップデート
 */
            if (autoMode === 'NORMAL') {
                // 1. 敵ゲートへの距離評価（攻めの配置）
                const distToEnemyGate = Math.min(...enemyGatePos.map(eg => getDistance({x: nx, y: ny}, eg)));
                const currentDistToEnemyGate = Math.min(...enemyGatePos.map(eg => getDistance({x: p.x, y: p.y}, eg)));

                // 敵ゲートそのもの（1マス以内に自分がいる場合） (+100)
                if (distToEnemyGate === 0 && currentDistToEnemyGate <= 1) {
                    score += cfg.REACH_ENEMY_GATE;
                }
                // 直近の相手ゲートに近づくためのマス (+30)
                if (distToEnemyGate < currentDistToEnemyGate) {
                    score += cfg.MOVE_TOWARD_GATE;
                }

                // 2. 自ゲート付近の評価（守りの配置）
                const distToSelfGate = getDistance({x: nx, y: ny}, p.startPos);
                // 自ゲートの2マス以内に敵がいるかチェック
                const isEnemyNearSelfGate = otherPlayers.some(ep => getDistance({x: ep.x, y: ep.y}, p.startPos) <= 2);
                
                // 自ゲート防衛（2マス内に敵がいる状況で、自ゲート2マス以内に配置） (+20)
                if (isEnemyNearSelfGate && distToSelfGate <= 2) {
                    score += cfg.SELF_GATE_DEFENSE;
                }
            } else {
                // EASYモード：単純に敵ゲートに近い場所
                const distToEnemyGate = Math.min(...enemyGatePos.map(eg => getDistance({x: nx, y: ny}, eg)));
                score = (100 - distToEnemyGate);
            }

            if (score > maxScore) {
                maxScore = score;
                bestPlaces = [{x: nx, y: ny}];
            } else if (score === maxScore) {
                bestPlaces.push({x: nx, y: ny});
            }
        }
    } 
    
    const bestPlace = bestPlaces.length > 0 ? bestPlaces[Math.floor(Math.random() * bestPlaces.length)] : null;

    if (bestPlace && typeof executePlaceCard === 'function') {
        executePlaceCard(bestPlace.x, bestPlace.y); 
    } else {
        endTurn(); 
    }
}

function checkAutoSkip() { 
    if (winner || isAutoSkipping || isPlacingCard || (invasionQueue && invasionQueue.length > 0)) return; 
    if (!players || !players[turn]) return;
    const p = players[turn]; 
    if (currentPhase === PHASE.LOCK) { 
        const hasLockableCard = hands[p.id] && hands[p.id].some(card => (card.type === "ETERNAL" && card.id !== 29) || (card.colorId === "rainbow" && card.id !== 29) || (card.colorId !== "white" && card.colorId !== "black" && card.id !== 29 && (collections[p.id][card.colorId].length === 0 || collections[p.id][card.colorId].some(cur => cur.id === 34))) ); 
        if (!hasLockableCard) { isAutoSkipping = true; setTimeout(() => { isAutoSkipping = false; nextPhase(); }, 1000); } 
    } 
    // After: isAutoAction (自動処理中) フラグを条件に追加し、連鎖スキップを防止
    else if (currentPhase === PHASE.HAND && hands[p.id] && hands[p.id].length === 0 && !isAutoAction) { 
        isAutoSkipping = true; setTimeout(() => { isAutoSkipping = false; nextPhase(); }, 1000); 
    } 
}

function checkStuck(p) { 
    if (!p) return true;
    
    // 修正：ディメンション効果中かつ未使用なら射程2、それ以外は射程1
    const moveRange = (p.dimensionActive && !p.baseMoveUsed) ? 2 : 1;
    
    // 全マスを走査して、現在の射程(moveRange)に移動可能なマスがあるかチェック
    for (let y = 0; y < GRID_SIZE; y++) {
        for (let x = 0; x < GRID_SIZE; x++) {
            const dist = Math.abs(p.x - x) + Math.abs(p.y - y);
            if (dist === moveRange) {
                const cell = board[y][x];
                const hasOpponent = players.some(ep => ep.id !== p.id && ep.x === x && ep.y === y);
                // カードがある、または他プレイヤーがいれば移動可能
                if (!cell.empty || hasOpponent) return false; 
            }
        }
    }
    return true; 
}


// 1. 先に processExile を定義します（アロー関数形式を維持）
const processExile = (tSlot) => {
    // 【追加】タイマーが動いていればクリアして二重実行を防ぐ
    if (autoProcessTimeout) {
        clearTimeout(autoProcessTimeout);
        autoProcessTimeout = null;
    }

    if (!players || !players[turn]) return;
    const p = players[turn];
    
    // 修正：呪い(ID:34)を含めて合計3枚重なると追放
    if (tSlot && tSlot.length >= 3 && tSlot.some(c => c.id === 34)) { 
        const cIdx = tSlot.findIndex(c => c.id === 34); 
        const curse = tSlot.splice(cIdx, 1)[0]; 
        tempAction = { card: curse };
        addLog("呪いが解けました！");
        
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


/**
 * 2026/03/11 新規追加：ロック実行前の割り込み検問所
 * 人間・AI・タイムアウトのすべてのロックはこの関数を通過します。
 */
/**
 * 2026/03/11 修正：割り込み検問所
 * 強欲なパレットと同様に、フェイズの制限を受けない直接実行ルートを構築。
 */
function requestLockCheck(card, cardIndex, lockedCard, p) {
    window.lastAttemptedColorId = card.colorId;
    const hasChottoMatta = hands[1] && hands[1].some(c => c.id === 21 && !c.sealed);

    if (hasChottoMatta && p.id !== 1) {
        addLog(`📢 ${p.name}のロックに対し、『ちょっと待った！』の権利を確認中...`);

        activeTimerPlayerId = 1; 
        isAutoAction = false;
        isAutoProcessing = false;
        if (typeof pauseTimer === 'function') pauseTimer();
        
        const chottoCard = hands[1].find(c => c.id === 21);

        showDetailModal("ちょっと待った！", `${p.name}が「${card.name}」をロックしようとしています。割り込みますか？`, chottoCard, "使用する", () => {
            closeDetailModal();
            // ★ 強欲なパレット方式：handleHandClickを通さず、直接効果解決へ
            activeHandCard = chottoCard;
            isHandEffectProcessing = true; // 処理中フラグを立てる

            executeCardEffect(chottoCard.handEffect, players.find(pl => pl.id === 1), (res) => {
                // 効果解決後の処理
                const curIdx = hands[1].indexOf(chottoCard);
                if (curIdx > -1) discardPile.push(hands[1].splice(curIdx, 1)[0]);
                
                isHandEffectProcessing = false;
                renderHand();
                // ※ タイマーの復帰は game_effects.js 側の最後で行います
            }, chottoCard);
        });

        const cnl = document.getElementById('detail-cancel-btn');
        if (cnl) {
            cnl.textContent = "パス";
            cnl.onclick = () => {
                closeDetailModal();
                activeTimerPlayerId = null;
                if (typeof resumeTimer === 'function') resumeTimer();
                proceedLockLogic(card, cardIndex, lockedCard, p);
            };
        }
    } else {
        proceedLockLogic(card, cardIndex, lockedCard, p);
    }
}



/**
 * 2026/03/11 修正
 * CPU/自動処理時であっても、自分が「ちょっと待った！」を持っている場合は割り込み確認を強制表示するよう修正。
 */
function handleHandClick(cardIndex, lockedCard = null) {
    const isAI = isAutoAction || isAutoProcessing;
    if (isPeekingMode || !players || !players[turn]) return;
    const displayTurn = isP1HandOnlyView ? 0 : turn;
    if (!isAI && displayTurn !== turn) {
        showToast("現在は P1 の手札を表示中ですが、操作権はありません。");
        return;
    }

    // 2026/03/11 修正：割り込み中(activeTimerPlayerIdが設定されている)なら、手番プレイヤーではなくタイマー保持者を優先する
    const actingP = activeTimerPlayerId ? players.find(pl => pl.id === activeTimerPlayerId) : players[turn];
    const p = actingP; // 以降、p は操作している人を指す
    const card = lockedCard || (hands[p.id] ? hands[p.id][cardIndex] : null);
    if (!card) return;

    if (currentPhase === PHASE.LOCK) {
        if (p.lockPrevented) return;
        if (card.colorId === 'white' || card.colorId === 'black' || card.id === 29) return;

        if (isAI) {
            // CPUやタイムアウト時は、確認なしで直接「検問所」へ
            requestLockCheck(card, cardIndex, lockedCard, p);
        } else {
            // 人間の場合は、「ロックする」を押した後に「検問所」へ
            showDetailModal("ロック確認", `「${card.name}」をロックしますか？`, card, "ロックする", () => {
                requestLockCheck(card, cardIndex, lockedCard, p);
            });
        }

    // 2026/03/11 修正：割り込み中、または「ちょっと待った」などの即時効果ならフェイズを問わず実行
    } else if (currentPhase === PHASE.HAND || card.handEffect?.anytime || activeTimerPlayerId === 1) { 
        // （ハンドフェイズの処理は変更なし）
        const executeLogic = () => {
            showCardModal(card, () => {
                activeHandCard = card; 
                executeCardEffect(card.handEffect, p, (res) => { 
                    if (!lockedCard && hands[p.id]) { 
                        const curIdx = hands[p.id].indexOf(card); 
                        if (curIdx > -1) {
                            const removedCard = hands[p.id].splice(curIdx, 1)[0]; 
                            if (!(res && res.stayOnBoard)) discardPile.push(removedCard); 
                        }
                    } 
                    isAutoProcessing = false; 
                    isAutoAction = false;
                    resetTimer(); 
                    updateGameState(); 
                }, card);
            }, "手札効果発動！", p.name, "手札から効果を発動しました");
        };

        if (isAI) {
            executeLogic();
        } else {
            showDetailModal(card.handEffect?.anytime ? "割込使用確認" : "手札使用確認", "このカードを使用しますか？", card, "使用する", executeLogic);
        }
    }
}

/**
 * 2026/03/11 外科手術的追加：共通化したロック実行ロジック
 */
function proceedLockLogic(card, cardIndex, lockedCard, p) {
    if (card.colorId === 'rainbow') {
        const lockableColors = BASE_COLORS.filter(c => collections[p.id][c.id].length === 0);
        showSelectionModal("RAINBOW LOCK", "どの色としてロックしますか？", lockableColors, "card-back-pattern", 1, (sel) => {
            const targetColorId = sel[0].id;
            if(!lockedCard && hands[p.id]) hands[p.id].splice(cardIndex, 1);
            const tSlot = collections[p.id][targetColorId];
            tSlot.push(card);
            if (typeof triggerLockEffect === 'function') triggerLockEffect(p.id, targetColorId);
            addLog(`${p.name}が「${card.name}」を${sel[0].name}としてロック！`);
            setTimeout(() => {
                isAutoProcessing = false;
                processExile(tSlot);
                if (currentPhase === PHASE.LOCK && !winner) nextPhase();
            }, 1000);
        }, false, null, null, null, p);
        return;
    }

    const slot = collections[p.id][card.colorId];
    if(!lockedCard && hands[p.id]) hands[p.id].splice(cardIndex, 1);
    slot.push(card);
    if (typeof triggerLockEffect === 'function') triggerLockEffect(p.id, card.colorId);
    addLog(`<span style="color:${p.color.hex}">●</span> <b>${p.name}</b> <span class="text-yellow-500">🔒 LOCK</span> 「${card.name}」`);

    setTimeout(() => {
        isAutoProcessing = false;
        isAutoAction = false;
        processExile(slot);
        if (currentPhase === PHASE.LOCK && !winner) nextPhase();
    }, 1200);
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

        // 1. 経過時間などのデータ準備
        const playTimeSec = Math.floor((Date.now() - gameStartTime) / 1000);
        window.currentPlayTime = playTimeSec;

        // --- 外科手術的修正：プロフィールの更新と保存 ---
        updateProfileAfterGame(pid);

        // 2. BGM停止と勝利SE再生
        if (window.gameBGM) {
            window.gameBGM.pause();
            window.gameBGM.currentTime = 0;
        }
        if (typeof playSE === 'function') {
            playSE('win.mp3'); 
        }

        // --- ★ここから演出の接続 ---
        // すぐにオーバーレイを出さず、カメラ演出を呼び出す
        if (typeof performVictoryCameraWork === 'function') {
            performVictoryCameraWork(pid, () => {
                // 演出（ズーム＆衝撃波）が終わった後に実行される処理
                showVictoryUI(pid); 
            });
        } else {
            // 万が一演出関数がない場合のフォールバック
            showVictoryUI(pid);
        }
    }
}

function showResultModal(pid, stats) {
    const resultOverlay = document.getElementById('result-overlay');
    const container = document.getElementById('result-items-container');
    if (!resultOverlay || !container) return;

    const player = players.find(p => p.id === pid);
    const s = stats.time || 0;
    const timeStr = `${Math.floor(s / 60)}分${(s % 60).toString().padStart(2, '0')}秒`;

    // 1. 基本項目のリスト生成
    const resultsHtml = [
        { label: "👑 勝者", value: player ? player.name : "不明" },
        { label: "⏳ タイム", value: timeStr },
        { label: "🔄 ターン", value: `${stats.turns || 0}` },
        { label: "🌟 MVP", value: stats.mvp || "なし" }
    ].map(item => `
        <div class="flex justify-between items-center bg-white/90 p-2 rounded border border-gray-300 shadow-sm">
            <span class="text-[10px] text-gray-600 font-bold">${item.label}</span>
            <span class="text-xs font-black text-black">${item.value}</span>
        </div>
    `).join('');

    // 2. 「逆転の兆し」グラフの生成
    const history = stats.lockHistory || [];
    const turnCount = history.length;
    const padding = 10;
    const width = 280;
    const height = 60;

    const linesHtml = players.map((p, pIdx) => {
        if (turnCount < 2) return "";
        const points = history.map((counts, tIdx) => {
            const x = (tIdx / (turnCount - 1)) * (width - padding * 2) + padding;
            const y = height - (counts[pIdx] / 7) * (height - padding * 2) - padding;
            return `${x},${y}`;
        }).join(" ");
        return `<polyline points="${points}" fill="none" stroke="${p.color.hex}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />`;
    }).join("");

    const lineChartHtml = `
        <div class="mt-6 pt-4 border-t border-gray-700">
            <p class="text-[9px] text-gray-500 font-bold mb-2 text-center uppercase tracking-widest">Signs of Reversal (Lock Progress)</p>
            <div class="bg-gray-900/50 rounded p-1 border border-gray-700">
                <svg viewBox="0 0 ${width} ${height}" class="w-full h-auto">
                    ${[0, 1, 2, 3, 4, 5, 6, 7].map(i => {
                        const y = height - (i / 7) * (height - padding * 2) - padding;
                        return `<line x1="${padding}" y1="${y}" x2="${width-padding}" y2="${y}" stroke="#374151" stroke-width="0.5" />`;
                    }).join("")}
                    ${linesHtml}
                </svg>
            </div>
            <div class="flex justify-center gap-2 mt-2">
                ${players.map(p => `<span class="text-[8px] flex items-center gap-1"><span class="w-2 h-0.5" style="background-color:${p.color.hex}"></span> ${p.name}</span>`).join("")}
            </div>
        </div>
    `;

    // 3. バーチャートの生成
    const maxVal = Math.max(...(stats.colorStats?.map(s => s.count) || [1]), 1);
    const chartHtml = `
        <div class="mt-6 pt-4 border-t border-gray-700">
            <p class="text-[9px] text-gray-500 font-bold mb-4 text-center uppercase tracking-widest italic">Color Usage Stats</p>
            <div class="flex items-end justify-between h-24 px-1 gap-2">
                ${(stats.colorStats || []).map(c => {
                    const heightPercent = (c.count / maxVal) * 100;
                    return `
                        <div class="flex-1 h-full flex flex-col justify-end items-center group">
                            <div class="w-full bg-gray-800/50 rounded-t-sm flex flex-col justify-end h-full overflow-hidden">
                                <div class="${c.bg} w-full rounded-t-sm animate-grow-up shadow-lg" 
                                     style="height: ${heightPercent}%; background-color: ${c.hex} !important;">
                                </div>
                            </div>
                            <span class="text-[8px] text-gray-600 font-bold mt-1 truncate w-full text-center">${c.name}</span>
                            <span class="text-[9px] text-black font-mono font-bold">${c.count}</span>
                        </div>
                    `;
                }).join('')}
            </div>
        </div>
    `;

    /** 2026/03/10 修正：未取得の称号獲得時に「NEW」バッジを表示する **/
    const currentAwards = calculateAwards(pid);
    
    const awardsHtml = currentAwards.map(award => {
        const cleanTitleName = award.name.replace(/[^\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FFa-zA-Z0-9]/g, "").trim();
        let isNew = false;

        if (award.pid === 1) {
            if (!userProfile.unlockedTitles.includes(cleanTitleName)) {
                userProfile.unlockedTitles.push(cleanTitleName);
                isNew = true; // 今回初めて手に入れたフラグ
                addLog(`🏆 新しい称号『${cleanTitleName}』をコレクションに加えました！`);
            }
        }

        return `
            <div class="relative flex flex-col items-center bg-gray-800/50 p-3 rounded-lg border border-gray-700 shadow-sm min-w-[80px]">
                ${isNew ? '<span class="absolute -top-2 -right-1 bg-red-600 text-white text-[8px] font-black px-1.5 py-0.5 rounded shadow-lg animate-bounce z-10">NEW</span>' : ''}
                <span class="text-lg mb-1">${award.name.split(' ')[0]}</span>
                <span class="text-[9px] font-bold text-gray-300 text-center leading-tight">${award.name.split(' ')[1] || ""}</span>
                <span class="text-[7px] text-gray-500 mt-1 uppercase">${award.desc}</span>
            </div>
        `;
    }).join('');

    /**
 * 2026/03/10 12:45 修正
 * 1. showResultModal 内で resultRankHtml が初期化前に参照されていたエラーを修正。
 * 2. 変数定義の順序を整理し、すべてのHTMLパーツが揃ってから描画するように変更。
 */

    // データの保存
    saveUserProfile();

    // --- 修正：変数の定義順を入れ替え（使う前に作る） ---

    // 4. 勲章セクションをHTMLにまとめる
    const awardsSectionHtml = `
        <div class="mt-6 pt-4 border-t border-gray-700">
            <p class="text-[9px] text-gray-500 font-bold mb-3 text-center uppercase tracking-widest">Match Awards</p>
            <div class="flex flex-wrap justify-center gap-3">
                ${awardsHtml}
            </div>
        </div>
    `;

    /** 2026/03/10 修正：リザルト画面にも色鮮やかなランク表示を適用 **/
    const p = userProfile;
    const rankData = [
        { en: "NONE", jp: "なし", hex: "#9ca3af" },
        { en: "Red Apprentice", jp: "赤の門下生", hex: "#ef4444" },
        { en: "Orange Survivor", jp: "橙の生存者", hex: "#f97316" },
        { en: "Yellow Seeker", jp: "黄の探求者", hex: "#eab308" },
        { en: "Green Guardian", jp: "緑の守護者", hex: "#22c55e" },
        { en: "Blue Tactician", jp: "青の策士", hex: "#3b82f6" },
        { en: "Pink Specialist", jp: "桃の専門家", hex: "#ec4899" },
        { en: "Purple Master", jp: "紫の熟練者", hex: "#a855f7" },
        { en: "SEVEN", jp: "虹の覇者", hex: "rainbow" }
    ];
    const currentRank = rankData[p.rank] || { en: "Unknown", jp: "", hex: "#9ca3af" };
    const isRainbow = currentRank.hex === "rainbow";

    const resultRankHtml = `
        <div class="mt-6 p-3 bg-gray-800/40 rounded-xl border border-gray-700 shadow-inner">
            <div class="flex justify-between items-end mb-2">
                <span class="text-[9px] text-gray-500 font-bold uppercase tracking-widest">Player Rank</span>
                <div class="flex flex-col items-end leading-tight">
                    <span class="text-[10px] font-black uppercase ${isRainbow ? 'animate-rainbow-text' : ''}" 
                          style="${!isRainbow ? `color: ${currentRank.hex}` : ''}">
                        ${currentRank.en}
                    </span>
                    <span class="text-[9px] font-bold ${isRainbow ? 'animate-rainbow-text' : ''}" 
                          style="${!isRainbow ? `color: ${currentRank.hex}; opacity: 0.8;` : ''}">
                        ${currentRank.jp}
                    </span>
                </div>
            </div>
            <div class="flex justify-between items-center gap-1">
                ${Array.from({ length: 7 }).map((_, i) => {
                    const isReached = i < p.rankPoint;
                    return `
                        <div class="flex-1 h-2 rounded-full border transition-all duration-1000 ${
                            isReached ? (isRainbow ? 'animate-rainbow-bg' : '') : 'bg-gray-900 border-gray-800'
                        }" style="${isReached && !isRainbow ? `background-color: ${currentRank.hex}; border-color: ${currentRank.hex}aa; box-shadow: 0 0 8px ${currentRank.hex}44;` : ''}">
                        </div>
                    `;
                }).join('')}
            </div>
            <p class="text-[8px] text-gray-500 text-right mt-1 font-mono italic">Next Rank: ${7 - p.rankPoint}pt</p>
        </div>
    `;

    // 5. すべてをまとめて一度に描画
    container.innerHTML = `<div class="space-y-2">${resultsHtml}</div>` + resultRankHtml + awardsSectionHtml + lineChartHtml + chartHtml;
    resultOverlay.classList.remove('hidden');
}

function startPlaceCardMode() { if (isPeekingMode) return; isPlacingCard = true; updateGameState(); }

/**
 * 2026/03/06 修正
 * 配置演出（3回点滅）を確実に視認できるよう処理順を厳密化。
 * animateCellBlinkの完了を待ってからデータを更新し、盤面を描画します。
 */
function executePlaceCard(x, y) { 
    if (isPeekingMode || !players || !players[turn]) return; 
    
    if (!isAutoAction) {
        if (typeof gainTime === 'function') gainTime(Math.min(5, currentPhaseMaxTime));
    }
    
    isProcessingMove = true;
    const p = players[turn]; 

    /**
 * 2026/03/06 修正
 * 配置時の点滅演出色をモード（ライト/ダーク）に応じて切り替えるように変更。
 * ライトモード時は黒、ダークモード時は白で発光させ視認性を高めます。
 */
    // ステップ1：点滅演出を実行
    // 表示モードに合わせて色を決定
    const blinkColor = isLightMode ? '#000000' : '#ffffff';

    const blinkPromise = (typeof animateCellBlink === 'function') 
        ? animateCellBlink(x, y, blinkColor) 
        : Promise.resolve();

    blinkPromise.then(() => {
        // ステップ2：演出が終わった直後にデータを更新
        const card = drawCard(); 
        if (card) { 
            board[y][x].empty = false; 
            board[y][x].revealed = false; 
            board[y][x].color = card; 
            board[y][x].stack = []; 
            addLog(`${p.name} が (${x}, ${y}) にカードを配置。`);
        }
        
        // 盤面を再描画（ここでカードが表示される）
        if (typeof renderBoard === 'function') renderBoard();

        // ステップ3：配置されたカードを確認するための「余韻」待機
        setTimeout(() => {
            isPlacingCard = false; 
            if (!p.baseMoveUsed) p.baseMoveUsed = true; 
            else if (p.extraMoves > 0) p.extraMoves--; 
            
            if (p.extraMoves > 0) { 
                addLog(`追加配置完了！(残り${p.extraMoves}回)`); 
                isProcessingMove = false; 
                resetTimer(); 
                updateGameState(); 
            } else { 
                endTurn(); 
            }
        }, 800); // 配置後の余韻
    });
}

function handleBoardClick(x, y) { 
    if (winner || currentPhase !== PHASE.MOVE || isStuck || isPlacingCard || isProcessingMove || isPeekingMode || !players[turn]) return; 
    const p = players[turn]; 
    const dist = Math.abs(p.x - x) + Math.abs(p.y - y); 
    const isTarget = (p.dimensionActive && !p.baseMoveUsed) ? (dist === 2) : (dist === 1); 
    if (!isTarget) return; 
    
    const cell = board[y][x], epOn = players.find(ep => ep.id !== p.id && ep.x === x && ep.y === y); 
    
    // 【修正箇所】追加移動（extraMoves消費）であるか判定
    const isExtra = p.baseMoveUsed && p.extraMoves > 0;

    // 【修正箇所】追加移動時は「接触」を禁止する。他プレイヤーがいる場合はクリックを無効化。
    if (isExtra && epOn) return;

    if (cell.empty && !epOn) return; 
    if (p.konohanaPenalty && epOn) return; 
    if (p.marmegoPenalty && !epOn) return;
    
    showDetailModal(epOn ? "接触確認" : (isExtra ? "追加移動確認" : "移動確認"), epOn ? "接触して手札を奪いますか？" : (isExtra ? "<b>追加移動</b> 権利を消費して移動しますか？" : "ここへ移動しますか？"), (!epOn && cell.revealed) ? cell.color : null, "実行", () => executeMove(x, y, cell, epOn)); 
}

function executeMove(x, y, cell, epOn) { 
    if (!players[turn]) return;
    if (!isAutoAction) {
        if (typeof gainTime === 'function') gainTime(Math.min(5, currentPhaseMaxTime));
    }
    isProcessingMove = true;
    const p = players[turn];
    
    // 【追加】移動開始時に次元跳躍状態ならフラグを消費（リセット）
    if (p.dimensionActive && !p.baseMoveUsed) {
        p.dimensionActive = false; 
    }

    if (epOn) window.activeTargetPlayerForCounter = epOn; 
    // ----------------

    const moveFinish = () => { 
    if (!p.baseMoveUsed) p.baseMoveUsed = true; 
    else if (p.extraMoves > 0) p.extraMoves--; 

    // ここで「自分のムーブフェイズか」を確認
    if (currentPhase === PHASE.MOVE) {
        if (p.extraMoves > 0) { 
            addLog(`追加移動権利残り ${p.extraMoves} 回`); 
            isProcessingMove = false; 
            resetTimer(); 
            updateGameState(); 
        } else { 
            checkAnytimeReactions(() => endTurn()); 
        } 
    } else {
        // ハンドフェイズ等での移動なら、単にフラグを下げて復帰
        isProcessingMove = false;
        updateGameState();
    }
};

    // 【外科手術的修正】接触か通常移動かを判別して詳細ログを出力
    if (epOn) {
        // ★ 外科手術的修正：接触時のアナウンス演出を追加
        const announcement = `<div class="text-xl font-black text-yellow-500 mb-2 italic">CONTACT!!</div>
                              <div class="text-sm">
                                <span style="color:${p.color.hex}">●</span><b>${p.name}</b> が<br>
                                <span style="color:${epOn.color.hex}">●</span><b>${epOn.name}</b> に接触します！
                              </div>`;
        
        // ログ出力
        addLog(`${p.name} が ${epOn.name} に接触しました！`);

        // アナウンスを表示してから、実際の処理（反撃確認など）へ
        if (typeof showMessageOverlay === 'function') {
            showMessageOverlay(announcement, 2500, () => {
                startStealSequence(epOn, moveFinish); 
            });
        } else {
            // 万が一関数がない場合の安全策
            startStealSequence(epOn, moveFinish);
        }
    } else {
        // 2026/03/06 修正：ログの視認性向上（プレイヤーカラー＋アイコン）
        addLog(`<span style="color:${p.color.hex}">●</span> <b>${p.name}</b> <span class="text-gray-400">👟 移動</span> (${x}, ${y})`);
        moveToCell(p, x, y, false, moveFinish); 
    }
}

/**
 * 2026/03/08 02:15 修正
 * 1. startStealSequence 内の構文エラー（不要な閉じカッコ）を清掃。
 * 2. 反撃演出(showCardModal)とAI自動処理の分岐ロジックを正確に統合。
 */

/**
 * 2026/03/08 11:45 修正
 * 1. 反撃者が人間(P1)の場合、システム全体の自動化フラグ(isAutoAction等)を一時的に強制解除。
 * 2. CPUのターン中であっても、P1の反撃確認モーダルがスキップされずに必ず表示されるよう修正。
 */
function startStealSequence(victim, callback) { 
    if (!players[turn] || !hands[victim.id]) return;
    const turnPlayer = players[turn]; 
    
    const counterCard = hands[victim.id].find(c => c.id === 22); 
    
    if (counterCard) {
        // ★ 内部関数：反撃の演出と処理を実行
        const processCounter = () => {
            showCardModal(counterCard, () => {
                hands[victim.id].splice(hands[victim.id].indexOf(counterCard), 1); 
                discardPile.push(counterCard); 
                addLog(`${victim.name}が「反撃」を発動！`); 

                const nextVictim = (victim.id === turnPlayer.id) ? (typeof activeTargetPlayerForCounter !== 'undefined' ? activeTargetPlayerForCounter : victim) : turnPlayer;
                startStealSequence(nextVictim, callback); 
            }, "手札効果発動", victim.name, "「反撃」で逆に奪い返します！");
        };

        // ★ 外科手術的修正：P1(自分)が狙われた場合、自動処理を一時停止させる
        if (victim.id === 1) {
            isAutoAction = false;       // 自動実行フラグを折る
            isAutoProcessing = false;   // 自動処理中フラグを折る
            if (typeof pauseTimer === 'function') pauseTimer(); // タイマーも止める
        }

        // 修正：victim.id !== 1 (自分以外) なら自動処理を許可
        if (isAutoAction && victim.id !== 1) {
            processCounter();
        } 
        else {
            // 自分(P1)の場合は、ここで確実にモーダルが表示され、入力待ちになります
            showDetailModal("反撃のチャンス", `${victim.name}さん、「反撃」で接触を無効化し、逆に強奪しますか？`, counterCard, "反撃する", () => {
                // OKを押した後は、必要に応じてフラグを戻すことも検討できますが、
                // 基本は演出（processCounter）へ流します
                processCounter();
            }, false);

            const cnlBtn = document.getElementById('detail-cancel-btn'); 
            if(cnlBtn) { 
                cnlBtn.textContent = "使わない"; 
                cnlBtn.onclick = () => { 
                    closeDetailModal(); 
                    startStealSequenceInternal(victim, callback); 
                }; 
            }
        }
        return;
    } 

    if (typeof startStealSequenceInternal === 'function') {
        startStealSequenceInternal(victim, callback);
    }
}

function startStealSequenceInternal(victim, callback, overrideInvader = null) {
    const invader = overrideInvader || players[turn];
    if (!hands[victim.id] || hands[victim.id].length === 0) { finishSteal(victim, null, callback, invader); return; } 
    showSelectionModal("強奪チャンス", `${invader.name}さん、1枚奪え！`, hands[victim.id], "card-back-pattern", 1, (cards) => finishSteal(victim, cards[0], callback, invader), true, null, null, null, invader);
}

/** 2026/03/09 修正：接触強奪時のカード確認モーダルを追加 **/
function finishSteal(victim, card, callback, invader) { 
    // 接触演出（衝撃波と画面揺れ）を実行
    if (typeof playContactEffect === 'function') {
        playContactEffect(victim.x, victim.y);
    }

    // 次のステップに進むための共通処理を関数化
    const proceed = () => {
        if (victim.x === victim.startPos.x && victim.y === victim.startPos.y) { 
            if(callback) callback(); 
        } 
        else { 
            moveToCell(victim, victim.startPos.x, victim.startPos.y, true, callback); 
        }
    };

    if (card) { 
        // データの移動
        hands[victim.id].splice(hands[victim.id].indexOf(card), 1); 
        hands[invader.id].push(card); 
        
        // ログの出力（『 』で強調）
        addLog(`<span style="color:${invader.color.hex}">●</span> <b>${invader.name}</b> <span class="text-red-500">💥 強奪</span> ➔ <b>${victim.name}</b> の 『${card.name}』`);

        // ★ 修正箇所：奪ったカードをモーダルで表示する
        if (typeof showCardModal === 'function') {
            showCardModal(card, () => {
                renderHand();
                proceed();
            }, "カード強奪", invader.name, `${victim.name} から奪いました！`);
        } else {
            renderHand();
            proceed();
        }
    } else {
        // カードを奪えなかった場合（相手の手札が0など）
        addLog(`${victim.name} は手札を持っていませんでした。`);
        proceed();
    }
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
        /** 2026/03/09 修正：ゲート侵入の監視 **/
        player.x = tx; 
        player.y = ty;

        const gateOwner = players.find(pl => pl.startPos.x === tx && pl.startPos.y === ty);
        if (gateOwner && gateOwner.id !== player.id) {
            // 侵攻回数をプラス
            matchStats.gateInvasionCount[gateOwner.id] = (matchStats.gateInvasionCount[gateOwner.id] || 0) + 1;
            
            if (!matchStats.gateInvaded) matchStats.gateInvaded = {};
            matchStats.gateInvaded[gateOwner.id] = true; 
            addLog(`[System] ${gateOwner.name} のゲートが ${player.name} に突破されました！ (通算 ${matchStats.gateInvasionCount[gateOwner.id]} 回目)`);
        }

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
        // --- 外科手術的修正：callbackがない場合の「自動継続」ロジック ---
        player.x = tx; player.y = ty;
        if (typeof renderBoard === 'function') renderBoard();

        // 連続到達（コンボ）の有無を確認
        const hasCombo = (destinationCard && cell.stack && cell.stack.length > 0 && cell.stack[0].revealed !== false);
        
        if (!hasCombo) {
            // これ以上到達がない場合、AIやフェイズの進行を阻害しないようフラグを下ろす
            isProcessingMove = false;
            
            // 現在のターンプレイヤーと移動したプレイヤーが違う場合（フォース等）
            if (player.id !== players[turn].id) {
                if (typeof updateGameState === 'function') updateGameState();
                
                // AIのターンなら思考を再開させる
                if (isAutoAction && typeof aiUseHandCard === 'function') {
                    setTimeout(() => aiUseHandCard(players[turn]), 500);
                }
            }
        }
    }
}

function handleArrivalLogic(cell, player, callback, cardObj, isNewReveal = false) {
    const curC = cardObj || cell.color;
    if (!curC) { if (callback) callback(); return; }

    // ★ 2026/03/08 修正：フォース等で動かされた本人が人間(P1)なら、自動処理を強制解除
    // これにより、CPUのターン中であっても、あなたの到達効果モーダルはあなたの確認を待ちます。
    if (player.id === 1) {
        isAutoAction = false;       // 自動実行をオフにする
        isAutoProcessing = false;   // 自動思考をストップさせる
        if (typeof pauseTimer === 'function') pauseTimer(); // あなたが考える間、タイマーも止める
    }
    
    player.processedArrivalCard = curC; // 処理開始フラグ

    /* --- 修正箇所：冒頭に発光演出と待機処理を追加 --- */
    // 1. まずド派手な発光をトリガー
    triggerArrivalRipple(player.x, player.y, curC.hex);

    // 2. 演出と余韻（計 約1.2秒）待ってから、本来のモーダル処理を開始する
    setTimeout(() => {

    /* --- 既存の雷演出(ID:24)や player.currentArrivalCard 設定、isDash判定等は変更なし --- */
        player.currentArrivalCard = curC;
        const isDash = curC.id === 15;

        const executeAndFollowUp = () => {
        executeCardEffect(curC.arrivalEffect, player, (res = {}) => {
            
            // 【重要】cleanupCellを修正：カードが消えたらフラグをリセット
            /** 2026/03/09 修正：エターナル獲得時のカウントと勝利時フラグの記録 **/
            const cleanupCell = () => {
                if (!(res && res.stayOnBoard)) {
                    // エターナル獲得時のカウントアップ（P1のみ）
                    if (player.id === 1 && curC.type === "ETERNAL") {
                        userProfile.totalEternalGets = (userProfile.totalEternalGets || 0) + 1;
                    }
                    // 勝利判定用に、最後にロックしたカードのタイプを記憶（checkWin直前で使用）
                    player.lastLockedCardType = curC.type;

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

            // より厳密な処理（混在対応版）
            const persistentCards = [];
            while(slot.length > 0) {
                const top = slot.pop();
                if (top.type === 'FIRST' || top.type === 'BOOST') {
                    persistentCards.push(top); // 保護対象は一時避難
                } else {
                    hands[invader.id].push(top); // 通常カードは手札へ
                }
            }
            // 保護したカードを戻し、最後にエターナルを追加
            persistentCards.forEach(pc => slot.push(pc));
            slot.push(c);

            checkWin(invader.id); 
            processForcedReturn(invader); 
        }, true, null, null, null, invader); 
    } else { 
        processForcedReturn(invader); 
    } 
}

function processForcedReturn(invader) { const gate = invader.startPos; setTimeout(() => { const gCell = board[gate.y][gate.x]; if (!gCell.empty) { showCardModal(gCell.color, () => { if(hands[invader.id]) hands[invader.id].push(gCell.color); if(gCell.stack?.length > 0) { gCell.color = gCell.stack.shift(); gCell.revealed = gCell.color.savedRevealedState || false; gCell.empty = false; } else { gCell.empty = true; } invader.x = gate.x; invader.y = gate.y; updateGameState(); setTimeout(processInvasionQueue, 1000); }, "自ゲートのカード獲得", invader.name, "獲得しました"); } else { invader.x = gate.x; invader.y = gate.y; updateGameState(); setTimeout(processInvasionQueue, 1000); } }, 1000); }

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

    /** 2026/03/09 修正：試合開始時の統計リセットと履歴記録 **/
    gameStartTime = Date.now(); 
    totalTurnCount = 1; 
    cardUsageStats = {}; 
    lockHistory = [];

    // --- 称号判定用カウンター(matchStats)の初期化 ---
    matchStats = {
    stolenCount: {},        // 奪った数
    matchVictimCount: {},   // 攻撃を受けた数
    counterSuccess: {},     // 反撃成功数
    flowerGifts: {},        // 花の贈り物（0th等）
    apocalypseChain: {},    // 連鎖数
    lavaDestroyCount: {},   // 溶岩での破壊数
    hasContacted: {},       // 接触履歴
    wasCursed: {},          // 呪いを受けた履歴
    gateInvaded: {},        // ゲート侵攻履歴
    gateInvasionCount: {},  // ゲート侵攻回数
    handEffectUsedCount: {}, // 手札効果使用数
    firstCardUseCount: {},   // FIRSTカード使用数
    lockBreakCount: {}      // ★ここが漏れていた：ロック破壊・奪取数
};

    // --- 長期称号用：使用アイコン履歴の記録（P1のみ） ---
    const p1Icon = (window.pendingProfiles && window.pendingProfiles[0]) ? window.pendingProfiles[0].icon : userProfile.icon;
    if (!userProfile.usedIconPaths) userProfile.usedIconPaths = [];
    if (!userProfile.usedIconPaths.includes(p1Icon)) {
        userProfile.usedIconPaths.push(p1Icon);
    }

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
     
    /** 2026/03/04 修正：cleanupGameによるリセット直後にHTMLから全設定を再ロードする **/
    cleanupGame(); 
    
    const tw = document.getElementById('timer-wrapper'); if(tw) tw.classList.remove('hidden'); 
    if (document.getElementById('my-lock-container')) document.getElementById('my-lock-container').classList.remove('hidden');
    if (document.getElementById('hand-area-container')) document.getElementById('hand-area-container').classList.remove('hidden');

    // --- HTMLの設定値を内部変数に完全同期（ここが生命線です） ---
    const timerToggle = document.getElementById('timer-mode-toggle');
    if (timerToggle) useGlobalTimer = timerToggle.checked;

    /** 2026/03/04 21:10 修正：CPU戦時の補充時間を確実に1秒に固定するよう修正 **/
    if (window.FORCED_CPU_MODE) {
        // --- CPU戦専用：固定設定 ---
        isP1TimerIgnored = true;
        isRandomLockOnTimeout = true;
        isAutoAction = true;
        isP1HandOnlyView = true;
        isSkipSelectionOnAuto = true;
        currentPhaseMaxTime = 15;
        window.PHASE_TIME_ADD = 1; 
        
        const pAddEl = document.getElementById('setting-phase-time-add');
        if (pAddEl) pAddEl.value = "1";
        addLog("[System] CPU戦モード：補充時間1秒を適用しました");
    } else {
        // --- 通常戦・テストモード：設定画面からリアルタイムに読み込み ---
        // ★修正ポイント：各フラグの読み込み先をHTMLのIDと厳密に一致させます
        isP1TimerIgnored = document.getElementById('setting-p1-timer-ignore')?.checked ?? false;
        isRandomLockOnTimeout = document.getElementById('setting-random-lock')?.checked ?? false;
        isAutoAction = document.getElementById('setting-auto-action')?.checked ?? false;
        
        // P1の手札のみ表示フラグ（変数名の不一致を修正：isP1HandOnlyView か isOnlyP1HandVisible か）
        const handOnlyEl = document.getElementById('setting-p1-hand-only');
        isP1HandOnlyView = handOnlyEl ? handOnlyEl.checked : false;

        isSkipSelectionOnAuto = document.getElementById('setting-skip-selection')?.checked ?? false;
        
        // 基本フェイズ秒数の反映
        const pTimeEl = document.getElementById('setting-phase-time');
        currentPhaseMaxTime = pTimeEl ? parseInt(pTimeEl.value) : 15;
        timeLeft = currentPhaseMaxTime; // 開始時のタイマーも同期

        // 補充時間の反映
        const pAddEl = document.getElementById('setting-phase-time-add');
        window.PHASE_TIME_ADD = pAddEl ? parseInt(pAddEl.value) : 15;
        
        addLog(`[System] 設定適用: 補充${window.PHASE_TIME_ADD}s / P1手札制限:${isP1HandOnlyView}`);
    }
    // 自動処理レベル(EASY/NORMAL)の同期
    const autoModeSelect = document.getElementById('setting-auto-mode');
    if (autoModeSelect) autoMode = autoModeSelect.value;
    
    // 【重要】ここで設定同期ブロック終了。これ以降に上書き処理がないことを確認。
    
    
    
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
    const bgmVolSlider = document.getElementById('setting-bgm-volume');
    window.gameBGM.volume = bgmVolSlider ? (parseInt(bgmVolSlider.value) / 100) : 0.3;

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

    // --- 既存の山札構築部分（if(!isTest) の中） ---
    if(!isTest) { 
        ['red','orange','yellow','green','blue','pink','purple'].forEach(col => {
            const colorNormals = normalCandidates.filter(d => d.colorId === col);
            colorNormals.forEach(c => {
                for(let i = 0; i < 7; i++) deckArr.push(createCardInstance(c));
            });
        });

        const rb = CARD_DATABASE.find(d => d.id === 29);
        for(let i = 0; i < 7; i++) deckArr.push(createCardInstance(rb));

        // ★修正箇所：無色カード不使用フラグをチェック
        const noColorless = document.getElementById('setting-no-colorless')?.checked;
        
        if (!noColorless) {
            // 通常時：白・黒カードを山札に追加
            const specialCounts = { 30: 2, 31: 2, 32: 1, 33: 1, 34: 1 };
            Object.keys(specialCounts).forEach(idStr => {
                const cardId = parseInt(idStr);
                const cardData = CARD_DATABASE.find(d => d.id === cardId);
                for(let i = 0; i < specialCounts[idStr]; i++) {
                    deckArr.push(createCardInstance(cardData));
                }
            });
        } else {
            // ONの時：ログに記録
            addLog(`<span class="text-gray-400">⚙️ 無色カード(白・黒)を除外して開始します</span>`);
        }

        deckArr.sort(() => Math.random() - 0.5); 
    } else {
        const pool = preservedTestCards && preservedTestCards.length > 0 ? preservedTestCards : [CARD_DATABASE.find(d=>d.id===29)];
        while(deckArr.length < 112) pool.forEach(c => { if(deckArr.length < 112) deckArr.push(createCardInstance(c)); });
        deckArr.sort(() => Math.random() - 0.5);
    }

    playerStats = {};
    
    // --- 既存コード（board生成の後、bCards確保の前あたり） ---
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
        
        // 事前設定されたプロフィールがあるか確認
        const profile = (window.pendingProfiles && window.pendingProfiles[i]) ? window.pendingProfiles[i] : null;

        const player = { 
            id: i+1, 
            x: pos.x, 
            y: pos.y, 
            startPos: {...pos}, 
            name: profile ? profile.name : `P${i+1}`, 
            // プロフィール画像（ステータス表示用）
            icon: profile ? profile.icon : `images/character_00${i+1}.webp`,
            // 駒の画像（元の piece_00X.png に固定）
            pieceImage: pColor.pieceImage, 
            color: pColor, 
            css: `${pColor.bg} border-2 border-white`, 
            extraMoves: 0, 
            baseMoveUsed: false, 
            viridianUsed: false, 
            serenadeUsed: false, 
            dimensionActive: false, 
            lockPrevented: false, 
            domusNeroUsed: false, 
            marmegoPenalty: false, 
            konohanaPenalty: false, 
            reactionSkip: false,
            totalTimeLeft: initTime, 
            timeoutStrikes: 0 
        }; 
        player.prevX = player.x; 
        player.prevY = player.y; 

        // 【追加】P2(index 1)以降の場合、割り当てられた色に合わせてアイコンを上書き
        if (i > 0 && window.pendingProfiles && window.pendingProfiles[i]) {
            const colorMap = { 'red': 1, 'orange': 2, 'yellow': 3, 'green': 4, 'blue': 5, 'pink': 6, 'purple': 7 };
            const colorIdx = colorMap[player.color.id];
            if (colorIdx) {
                window.pendingProfiles[i].icon = `images/character_00${colorIdx}.webp`;
                player.icon = window.pendingProfiles[i].icon; // playerオブジェクト側のアイコンも更新
            }
        }

        return player; 
    });

    playerStats = {};
    players.forEach(p => {
        playerStats[p.id] = { moveCount: 0 };
    });

    

    turn = 0; currentPhase = PHASE.LOCK; winner = null; 
    collections = {}; hands = {}; invasionQueue = []; 
    players.forEach((p, idx) => {
        collections[p.id] = {};
        [...new Set(CARD_DATABASE.map(c => c.colorId))].forEach(cId => collections[p.id][cId] = []);
        hands[p.id] = [];
        
        const fCard = isTest && testFirstCards[idx] ? testFirstCards[idx] : CARD_DATABASE.find(d => d.type === 'FIRST' && d.colorId === p.color.id);
        if(fCard) collections[p.id][fCard.colorId].push(createCardInstance(fCard));

        // --- ブーストモード処理 ---
        const isBoostMode = document.getElementById('setting-boost-mode')?.checked;
        if (isBoostMode && fCard) {
            // BASE_COLORS から現在の色のインデックスを取得
            const colorIdx = BASE_COLORS.findIndex(c => c.id === fCard.colorId);
            if (colorIdx !== -1) {
                // 両隣のインデックスを計算（環状構造）
                const leftIdx = (colorIdx - 1 + BASE_COLORS.length) % BASE_COLORS.length;
                const rightIdx = (colorIdx + 1) % BASE_COLORS.length;
                const neighborColors = [BASE_COLORS[leftIdx].id, BASE_COLORS[rightIdx].id];

                neighborColors.forEach(colId => {
                    // 対応するブーストカードを探してロック
                    const bCardData = CARD_DATABASE.find(d => d.type === 'BOOST' && d.colorId === colId);
                    if (bCardData) {
                        collections[p.id][colId].push(createCardInstance(bCardData));
                        addLog(`${p.name}: ${bCardData.name}をブーストロック！`);
                    }
                });
            }
        }
        
        
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

    // ★ collections の初期化が完全に終わった「ここ」で呼び出す
    recordLockHistory();

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

    // 【外科手術的修正】テストモード時は自動的なターン開始(startTurn)を徹底的にブロックする
    if (!isTest) {
        // 1. 全プレイヤーからランダムに先手を選択
        const startIndex = Math.floor(Math.random() * players.length);
        turn = startIndex; // グローバル変数の turn を更新
        
        const firstPlayer = players[startIndex];
        const msg = `<div class="flex flex-col items-center gap-4 animate-bounce">
            <span class="text-xs text-gray-400 font-bold tracking-[0.3em] uppercase">Starting Order</span>
            <div class="flex items-center gap-3 bg-white/10 px-6 py-3 rounded-full border border-white/20">
                <span class="text-2xl font-black text-yellow-400">1st</span>
                <img src="${firstPlayer.icon}" class="w-10 h-10 rounded-full border-2 border-yellow-500 shadow-[0_0_15px_rgba(234,179,8,0.5)]">
                <span class="text-xl font-bold text-white">${firstPlayer.name}</span>
            </div>
        </div>`;

        // 2. メッセージを2秒表示してからロゴ→ゲーム開始へ
        showMessageOverlay(msg, 2000, () => {
            showOpeningLogo(startTurn);
        });
        
        addLog(`[System] 先手決定：<b>${firstPlayer.name}</b> からゲームを開始します。`);
    } else {
        // テストモード時はアニメーション完了のログだけ出し、
        // flowPos 側の制御（駒の配置待ち）に処理を明け渡す
        console.log("テストモード：盤面配置完了。配置待ちへ...");
    }
}

async function initGame(n) { 
    
    await initGameInternal(n); 
}

function showOpeningLogo(callback) {
    const logoOverlay = document.createElement('div');
    logoOverlay.className = "fixed inset-0 flex items-center justify-center logo-overlay-active";
    logoOverlay.innerHTML = `
        <img src="images/logo.webp" class="w-64 animate-logo-entrance shadow-[0_0_50px_rgba(234,179,8,0.4)]" alt="LOGO">
    `;
    document.body.appendChild(logoOverlay);

    if (typeof playSE === 'function') {
        playSE('se_title_impact.mp3'); 
    }

    setTimeout(() => {
        logoOverlay.style.transition = "opacity 0.8s ease";
        logoOverlay.style.opacity = "0";
        setTimeout(() => {
            logoOverlay.remove();
            if (callback) callback(); 
        }, 800);
    }, 2000);
}

/**
 * 2026/02/23 18:20 修正
 * START GAME ボタンから呼ばれる専用の関数。
 * ここで初めてプロフィール設定が必要かチェックします。
 */
/**
 * 修正日: 2026/03/05
 * 修正概要: プロフィールが一度設定されていれば、START GAME後に設定モーダルをスキップするように修正
 */
function openProfileSetup() {
    /** 2026/03/05 修正: 
     * window.isProfileSet が false であっても、localStorage にデータがあれば
     * 設定済みとみなしてホーム画面またはセットアップ画面へ直接遷移させます。
     */
    const hasSavedProfile = localStorage.getItem('shades_seven_profile');
    
    if (window.isProfileSet || hasSavedProfile) {
        window.isProfileSet = true; // メモリ上のフラグも立てる
        
        const titleEl = document.getElementById('title-overlay');
        const setupEl = document.getElementById('setup-overlay');
        const homeScreen = document.getElementById('home-screen');
        
        if (titleEl) titleEl.classList.add('hidden');
        
        // ホーム画面がある場合はホームへ、なければ人数選択(setup)へ
        if (homeScreen) {
            homeScreen.classList.remove('hidden');
            const nameDisplay = document.getElementById('home-user-name');
            if (nameDisplay && userProfile) nameDisplay.textContent = userProfile.name;
        } else if (setupEl) {
            setupEl.classList.remove('hidden');
        }
        return;
    }

    // まだ一度も設定していない場合のみプロフィールモーダルを表示
    const modal = document.getElementById('profile-setup-modal');
    if (modal) {
        modal.classList.remove('hidden');
        modal.style.display = 'flex';
        if (typeof setupProfileUI === 'function') setupProfileUI(); 
    }
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

        // --- 修正箇所：ロゴ演出を表示し、終わったらタイマーリセットと状態更新を行う ---
        showOpeningLogo(() => {
            resetTimer(); 
            updateGameState(); 
        });
        
    }, null, null, true, null, false, null, null, null, players[1]);
}, null, null, true, null, false, null, null, null, players[0]);
}

async function startTestGame() { 
    if(!testSelectedCards || testSelectedCards.length === 0) { showToast("カードを選んでください"); return; } 
    
    // 1. モーダルを隠す
    const testEl = document.getElementById('test-mode-modal'); 
    if(testEl) testEl.classList.add('hidden'); 
    
    // --- 【追加】テスト人数を選択させる ---
    const waitForNumber = () => {
        return new Promise((resolve) => {
            showSelectionModal("TEST PLAYERS", "テストする人数を選んでください", [
                { id: 2, name: "2人戦", type: "PLAYER_SELECT" },
                { id: 3, name: "3人戦", type: "PLAYER_SELECT" },
                { id: 4, name: "4人戦", type: "PLAYER_SELECT" }
            ], "card-back-pattern", 1, (result) => resolve(result[0].id));
        });
    };

    const playerNum = await waitForNumber();
    await new Promise(r => setTimeout(r, 400));

    const firstCards = CARD_DATABASE.filter(c => c.type === 'FIRST');
    const lockPool = CARD_DATABASE.filter(c => c.type === 'NORMAL' || c.type === 'ETERNAL'); 
    testFirstCards = []; 
    testInitialLocks = []; // 人数分用意するので初期化

    // 共通の選択ヘルパー
    const waitForSelection = (title, desc, source, back, count) => {
        return new Promise((resolve) => {
            showSelectionModal(title, desc, source, back, count, (result) => {
                resolve(result);
            }, false, () => {
                resolve([]);
            }, "ランダム/スキップ");
        });
    };

    // --- 【外科手術的進化】人数分ループで回す ---
    for (let i = 0; i < playerNum; i++) {
        const pName = `P${i + 1}`;
        
        // ファーストカード選択
        let selF = await waitForSelection(`${pName} FIRST`, `${pName}のファーストカードを選択`, firstCards, "card-back-pattern", 1);
        testFirstCards[i] = selF.length > 0 ? selF[0] : firstCards[Math.floor(Math.random() * firstCards.length)];
        await new Promise(r => setTimeout(r, 300));

        // 初期ロック選択
        testInitialLocks[i] = await waitForSelection(`${pName} LOCKS`, `${pName}の初期ロックを選択（最大7枚）`, lockPool, "card-back-pattern", 7);
        await new Promise(r => setTimeout(r, 300));
    }

    // --- 最終 Step: 盤面構築と駒配置 ---
    addLog(`${playerNum}人戦の盤面を構築中...`);
    
    // プレイヤー人数を渡して初期化
    await initGameInternal(playerNum, true); 
    
    if(timerInterval) clearInterval(timerInterval); 
    players.forEach(p => { p.x = -1; p.y = -1; });
    renderBoard();

    await new Promise(r => setTimeout(r, 800));

    // 全員の初期位置を順番に選ぶループ
    for (let i = 0; i < playerNum; i++) {
        const p = players[i];
        await new Promise((resolve) => {
            startSelectionMode('select_cell', 1, `test_pos_p${p.id}`, `${p.name}の開始位置を選択してください`, (sel) => {
                if (sel && sel.length > 0) {
                    p.x = sel[0].x; p.y = sel[0].y; p.startPos = {...sel[0]};
                    renderBoard();
                }
                resolve();
            }, null, null, true, null, false, null, null, null, p);
        });
        await new Promise(r => setTimeout(r, 300));
    }

    addLog("すべての準備が整いました。テスト開始！");
    showOpeningLogo(() => {
        resetTimer(); 
        updateGameState(); 
    });
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

function setupProfileUI() {
    const p1Container = document.getElementById('p1-icon-selector');
    const startBtn = document.getElementById('start-with-profile-btn');
    if (!p1Container || !startBtn) return;

    let selectedIcon = "images/character_001.webp"; 

    const renderIcons = () => {
        p1Container.innerHTML = '';
        // 横一列に並べるための親コンテナのクラス指定
        p1Container.className = "flex flex-row justify-between w-full gap-1 px-1";
        
        for (let i = 1; i <= 7; i++) {
            const iconPath = `images/character_00${i}.webp`;
            const img = document.createElement('img');
            img.src = iconPath;
            // アイコンサイズを w-9 に少しだけ小さくして、7枚が1列に収まりやすくしました
            img.className = `w-9 h-9 rounded-full border-2 cursor-pointer transition-all shrink-0 ${selectedIcon === iconPath ? 'border-yellow-500 scale-110 z-10' : 'border-transparent opacity-50'}`;
            img.onclick = () => {
                selectedIcon = iconPath;
                renderIcons();
            };
            p1Container.appendChild(img);
        }
    };
    renderIcons();

    startBtn.onclick = () => {
        const nameInput = document.getElementById('p1-name-input');
        const name1 = (nameInput && nameInput.value) ? nameInput.value : "P1";
        
        // --- 外科手術的追加：userProfile（永続データ）の更新 ---
        userProfile.name = name1;
        userProfile.icon = selectedIcon;
        saveUserProfile();           // localStorageへ保存
        updateProfileButtonVisual(); // UI上のボタン画像を更新

        // P1のみ設定、他はデフォルト
        window.pendingProfiles = [
            { name: name1, icon: selectedIcon },
            { name: "P2", icon: "images/character_002.webp" },
            { name: "P3", icon: "images/character_003.webp" },
            { name: "P4", icon: "images/character_004.webp" }
        ];
        window.isProfileSet = true;

        // 1. プロフィールモーダルを非表示
        const profileModal = document.getElementById('profile-setup-modal');
        if (profileModal) {
            profileModal.classList.add('hidden');
            profileModal.style.display = 'none';
        }

        // 2. タイトル画面（START GAMEがある画面）を隠す
        const titleOverlay = document.getElementById('title-overlay');
        if (titleOverlay) {
            titleOverlay.classList.add('hidden');
        }

        /** 2026/03/04 修正：ホーム表示時にセットアップ画面を完全に隠す **/
        // 3. ホーム画面を表示
        const homeScreen = document.getElementById('home-screen');
        const setupOverlay = document.getElementById('setup-overlay'); // 追加
        const nameDisplay = document.getElementById('home-user-name');
        
        if (nameDisplay) nameDisplay.textContent = name1;
        
        // 背後のセットアップ画面を隠し、ホーム画面を表示する
        if (setupOverlay) setupOverlay.classList.add('hidden'); // 追加：これで透けなくなります
        if (homeScreen) {
            homeScreen.classList.remove('hidden');
        }
    };
}

/**
 * 2026/03/05 15:15 新規追加
 * プロフィール編集専用の関数。
 * 保存してもホームに戻らず、詳細画面を再表示します。
 */
/**
 * 2026/03/08 10:00 修正
 * 1. openProfileEdit 内の変数名重複エラー(okBtnの再宣言)を修正。
 * 2. ボタンのクローンによるイベント初期化と、編集用ロジックの割り当てを正常化。
 */
function openProfileEdit() {
    const modal = document.getElementById('profile-setup-modal');
    if (!modal) return;

    // ★ 外科手術：1回目からアイコンを表示させるため、まずUIを構築する
    if (typeof setupProfileUI === 'function') {
        setupProfileUI();
    }

    // 1. ボタンのリセット（クローンによるイベント消去）
    let okBtn = document.getElementById('start-with-profile-btn');
    if (okBtn) {
        const newOkBtn = okBtn.cloneNode(true);
        okBtn.parentNode.replaceChild(newOkBtn, okBtn);
        okBtn = newOkBtn;
    }

    // 2. モーダルを表示
    modal.classList.remove('hidden');
    modal.style.display = 'flex';

    // 3. 現在の名前を入力欄にセット
    const nameInput = document.getElementById('p1-name-input');
    if (nameInput) {
        nameInput.value = userProfile.name; 
    }

    // 4. タイトルを「EDIT PROFILE」に変更
    const title = modal.querySelector('h2');
    if (title) title.textContent = "EDIT PROFILE";

    // 5. 書き換えた「新品のボタン」に編集用の動きを割り当てる
    if (okBtn) {
        okBtn.textContent = "保存して戻る";

        okBtn.onclick = () => {
            const newName = (nameInput && nameInput.value) ? nameInput.value : userProfile.name;
            
            // アイコンは現在選択されているものを取得
            const selectedImg = modal.querySelector('#p1-icon-selector img.border-yellow-500');
            const iconPath = selectedImg ? selectedImg.src : userProfile.icon;

            // データの保存と反映
            userProfile.name = newName;
            userProfile.icon = iconPath;
            
            if (typeof saveUserProfile === 'function') saveUserProfile();
            if (typeof updateProfileButtonVisual === 'function') updateProfileButtonVisual();

            // モーダルを閉じる
            modal.classList.add('hidden');
            modal.style.display = 'none';

            // プロフィール詳細画面を再表示
            showUserProfileModal();

            // 次回（新規登録時など）のためにボタンとタイトルを初期化
            okBtn.textContent = "OK";
            if (title) title.textContent = "PLAYER SETUP";
            
            if (typeof setupProfileUI === 'function') setupProfileUI();
        };
    }
}

// --- 追加箇所：game_core.js の任意の場所（末尾などでOK） ---
function pauseTimer() {
    isTimerPaused = true;
}

function resumeTimer() {
    isTimerPaused = false;
}

/**
 * 2026/02/24 17:35 修正
 * 1. P1手札固定設定のリスナーをグローバルに追加
 */
document.addEventListener('DOMContentLoaded', () => {
    const p1HandOnlyInput = document.getElementById('setting-p1-hand-only');
    if (p1HandOnlyInput) {
        p1HandOnlyInput.addEventListener('change', (e) => {
            isP1HandOnlyView = e.target.checked;
            if (typeof renderHand === 'function') renderHand(); 
            if (typeof addLog === 'function') addLog(isP1HandOnlyView ? "デバッグ：P1手札固定表示 ON" : "デバッグ：P1手札固定表示 OFF");
        });
    }
});

function recordLockHistory() {
    if (!players || players.length === 0) return;
    const currentCounts = players.map(p => {
        // 安全装置：collections[p.id] が無ければ 0 を返す
        if (!collections || !collections[p.id]) return 0;

        return LOCK_ORDER.filter(col => {
            const slot = collections[p.id][col.id];
            // slot 自体の存在チェックも追加
            return slot && slot.length > 0 && 
                   slot.some(c => c.colorId !== 'white' && c.colorId !== 'black') && 
                   !slot.some(c => c.id === 34);
        }).length;
    });
    lockHistory.push(currentCounts);
}

/** 2026/03/09 修正：エターナル関連の称号判定ロジックを追加 **/
function calculateAwards(winnerId) {
    const awards = [];
    if (!players || players.length === 0) return awards;

    const winner = players.find(p => p.id === winnerId);

    // --- [新規] ラスト・エターニティの判定 ---
    if (winner && winner.lastLockedCardType === "ETERNAL") {
        awards.push({ pid: winnerId, name: "💎 ラスト・エターニティ", desc: "永遠のカードで勝利を確約せし者" });
    }

    // --- [新規] ゲート侵攻回数（エターナラー系）の累計判定 ---
    if (winnerId === 1) { // P1（自分）のみプロフィールに反映
        const count = userProfile.totalEternalGets || 0;
        if (count >= 7) awards.push({ pid: 1, name: "🏆 レジェンド・エターナラー", desc: "七つの門を越えし伝説" });
        else if (count >= 3) awards.push({ pid: 1, name: "⚔️ エターナラー", desc: "禁断の力を集めし実力者" });
        else if (count >= 1) awards.push({ pid: 1, name: "👣 静かなる侵攻者", desc: "境界を越えた新鋭の足跡" });
    }

    // --- 外科手術的修正：プレイヤー数に応じたボーダー（人数×7ターン）を算出 ---
    const turnThreshold = players.length * 7;

    // 1. 電光石火 (Lightning Fast)
    if (totalTurnCount <= turnThreshold) {
        awards.push({ pid: winnerId, name: "⚡ 電光石火", desc: `${turnThreshold}ターン以内の電撃決着` });
    }

    /** 2026/03/10 修正：不動の精神を「最小移動で勝利した勝者」限定に変更 **/
    // 2. 韋駄天 & 不動の精神 の基礎データ算出
    let maxDist = -1, fastestId = null;
    let minDist = Infinity, slowestId = null;
    let maxTypes = -1, collectorId = null;

    players.forEach(p => {
        const d = (playerStats[p.id] && playerStats[p.id].moveCount) || 0;
        // 最長距離の特定
        if (d > maxDist) { maxDist = d; fastestId = p.id; }
        // 最短距離の特定
        if (d < minDist) { minDist = d; slowestId = p.id; }

        const stats = cardUsageStats[p.id] || {};
        const typesCount = Object.keys(stats).length;
        if (typesCount > maxTypes) { maxTypes = typesCount; collectorId = p.id; }
    });

    // 韋駄天：最長距離を走ったのが「勝者」かつターン制限以内
    if (fastestId === winnerId && totalTurnCount <= turnThreshold) {
        awards.push({ pid: winnerId, name: "👟 韋駄天", desc: `${turnThreshold}ターン以内に戦場を最も駆け抜けた` });
    }

    // 不動の精神：最短距離なのが「勝者」である場合のみ授与
    if (slowestId === winnerId) {
        awards.push({ pid: winnerId, name: "🧘 不動の精神", desc: "一歩も無駄にせぬ支配で勝利を掴んだ" });
    }

    /** 2026/03/10 修正：カード愛好家の条件を14種類（カード名ベース）に強化 **/
    if (collectorId === winnerId && maxTypes >= 14) {
        awards.push({ 
            pid: winnerId, 
            name: "📚 カード愛好家", 
            desc: "14種以上のカードを駆使して戦場を支配した証" 
        });
    }

    // 4. 特定色のスペシャリスト & 5. 一点突破
    const wStats = cardUsageStats[winnerId] || {};
    const cardEntries = Object.entries(wStats);

    // 【外科手術的修正】エターナルカードも確実に CARD_DATABASE から検索して統計に含める
    if (cardEntries.length > 0) {
        // 最多使用カード（MVP）の特定
        let topCard = null;
        let maxCount = 0;

        cardEntries.forEach(([name, count]) => {
            if (count > maxCount) {
                maxCount = count;
                topCard = CARD_DATABASE.find(d => d.name === name);
            }
        });

        if (topCard) {
            // MVP情報を stats に保存（プロフ画面用）
            userProfile.stats.mvpCard = topCard.name;
        }
        // 一点突破
        const totalUsages = cardEntries.reduce((a, b) => a + b[1], 0);
        const avgUsage = totalUsages / cardEntries.length;
        for (const [name, count] of cardEntries) {
            if (count >= avgUsage * 3 && count >= 3) {
                awards.push({ pid: winnerId, name: "🎯 一点突破", desc: `「${name}」を極めし者` });
                break;
            }
        }
        /** 2026/03/09 修正：色ごとの「愛好家」勲章を判定 **/
        const colorUsage = {};
        BASE_COLORS.forEach(c => colorUsage[c.id] = 0);
        cardEntries.forEach(([name, count]) => {
            const data = CARD_DATABASE.find(d => d.name === name);
            if (data && colorUsage[data.colorId] !== undefined) colorUsage[data.colorId] += count;
        });

        for (const [colId, count] of Object.entries(colorUsage)) {
            // その色のカードを3回以上使用、かつその試合での最多使用色であれば「愛好家」
            const isMostUsedColor = Object.values(colorUsage).every(v => count >= v);
            if (count >= 3 && isMostUsedColor) {
                const cName = BASE_COLORS.find(bc => bc.id === colId).name;
                awards.push({ pid: winnerId, name: `✨ ${cName}の愛好家`, desc: `${cName}のカードを最も愛用した` });
                // 一番多い色を1つ取ったら抜ける
                break;
            }
        }
    }

    // 6. 逆転の覇者 & 堅実な守り手
    if (lockHistory && lockHistory.length >= 4) {
        const wIdx = players.findIndex(p => p.id === winnerId);
        let alwaysFirst = true, wasLastFirstHalf = false;
        const mid = Math.floor(lockHistory.length / 2);
        lockHistory.forEach((counts, tIdx) => {
            const wC = counts[wIdx], maxC = Math.max(...counts), minC = Math.min(...counts);
            if (wC < maxC) alwaysFirst = false;
            if (tIdx <= mid && wC === minC && counts.some(c => c > minC)) wasLastFirstHalf = true;
        });
        if (alwaysFirst) awards.push({ pid: winnerId, name: "🛡️ 堅実な守り手", desc: "一度も首位を譲らぬ完封" });
        else if (wasLastFirstHalf) awards.push({ pid: winnerId, name: "🔄 逆転の覇者", desc: "絶望から這い上がった伝説" });
    }
    
    // 7. 虹の覇者 (Rainbow Master) ★2026/03/09 新条件適用
    if (winner) {
        // 勝者の全ロックエリアをフラットな配列にして、カード名が「なないろの欠片」のものを抽出
        const lockedFragments = Object.values(collections[winnerId] || {})
            .flat()
            .filter(card => card && card.name === "なないろの欠片");

        if (lockedFragments.length >= 7) {
            awards.push({ 
                pid: winnerId, 
                name: "🌈 虹の覇者", 
                desc: "「なないろの欠片」を七つ揃えし伝説の証" 
            });
        }
    }

    // --- 1. バトル・テクニカル系 ---
    // カウンター・ストライク
    if ((matchStats.counterSuccess[winnerId] || 0) >= 2) {
        awards.push({ pid: winnerId, name: "⚔️ カウンター・ストライク", desc: "1試合に2回以上の反撃を成功" });
    }

    // 無慈悲な強奪者
    if ((matchStats.stolenCount[winnerId] || 0) >= 5) {
        awards.push({ pid: winnerId, name: "🧤 無慈悲な強奪者", desc: "相手から合計5枚以上のカードを強奪" });
    }

    // デッドヒート（全員が残り1色の状態で勝利）
    const isDeadHeat = players.every(pl => {
        const count = LOCK_ORDER.filter(col => collections[pl.id][col.id].length > 0).length;
        return count >= 6;
    });
    if (isDeadHeat && winner) {
        awards.push({ pid: winnerId, name: "🔥 デッドヒート", desc: "全員がリーチ状態の極限戦を制した" });
    }

    // --- 2. カード・コンボ系 ---
    // 予言の完成者
    if ((matchStats.apocalypseChain[winnerId] || 0) >= 3) {
        awards.push({ pid: winnerId, name: "🔮 予言の完成者", desc: "アポカリプスを3回連続で的中" });
    }

    // ワイナウエアの怒り
    if ((matchStats.lavaDestroyCount[winnerId] || 0) >= 10) {
        awards.push({ pid: winnerId, name: "🌋 ワイナウエアの怒り", desc: "火山で10枚以上のカードを灰にした" });
    }

    // レインボー・メーカー
    const fragCount = Object.values(collections[winnerId] || {}).flat().filter(c => c.name === "なないろの欠片").length;
    if (fragCount >= 3) {
        awards.push({ pid: winnerId, name: "🌈 レインボー・メーカー", desc: "「なないろの欠片」を3枚以上ロック" });
    }

    // --- 3. プレイスタイル・特殊系 ---
    // 平和の使者（一度も接触による強奪を行わずに勝利）
    if (!matchStats.hasContacted[winnerId]) {
        awards.push({ pid: winnerId, name: "🕊️ 平和の使者", desc: "一度も相手からカードを奪わず勝利" });
    }

    // ラッキーセブン（7の倍数ターンで勝利）
    if (totalTurnCount > 0 && totalTurnCount % 7 === 0) {
        awards.push({ pid: winnerId, name: "🎰 ラッキーセブン", desc: `${totalTurnCount}ターン目、運命の数字で勝利` });
    }

    // 博愛主義
    if ((matchStats.flowerGifts[winnerId] || 0) >= 3) {
        awards.push({ pid: winnerId, name: "🌸 博愛主義", desc: "相手に3回以上カードをプレゼントした" });
    }

    // 呪いからの生還
    // （ロックエリアにID:34が1枚以上あった形跡があり、且つ勝利時に呪いが0枚の場合）
    const currentCurses = Object.values(collections[winnerId]).flat().filter(c => c.id === 34).length;
    if (matchStats.wasCursed && matchStats.wasCursed[winnerId] && currentCurses === 0) {
        awards.push({ pid: winnerId, name: "✨ 呪いからの生還", desc: "呪いをすべて振り払って勝利" });
    }

    // --- 不落のゲートキーパーの判定 ---
    // ゲート突破フラグ(gateInvaded)が立っていない勝者なら獲得
    if (winner && (!matchStats.gateInvaded || !matchStats.gateInvaded[winnerId])) {
        awards.push({ pid: winnerId, name: "🛡️ 不落のゲートキーパー", desc: "一度もゲートへの侵入を許さず完全勝利" });
    }

    /** 2026/03/09 修正：長期累計称号の最終判定ロジック **/
    if (winnerId === 1) { // 累計称号はプレイヤー1（自分）の統計を参照
        
        // --- 1. 七色の旅人 (全プレイヤーアイコンを一度は使用) ---
        // 選択可能なアイコン数（例: 8種類）に対して、使用済みのパス数を比較
        // ここでは便宜上 4種類以上としていますが、実際のアイコン数に合わせて調整可能です
        if (userProfile.usedIconPaths && userProfile.usedIconPaths.length >= 4) {
            awards.push({ pid: 1, name: "🌈 七色の旅人", desc: "様々な姿で戦場を渡り歩いた旅の記録" });
        }

        // --- 2. 歴戦の勇士 (通算対局数 100回) ---
        if (userProfile.stats && userProfile.stats.totalGames >= 100) {
            awards.push({ pid: 1, name: "🎖️ 歴戦の勇士", desc: "百戦錬磨の経験を持つ真の戦士" });
        }

        // --- 3. 0thの理解者 (全カード ID 1〜34 を一度は使用) ---
        // 重複を除いた使用済みID数が 34 に達しているかチェック
        if (userProfile.usedCardIds && userProfile.usedCardIds.length >= 34) {
            awards.push({ pid: 1, name: "📖 0thの理解者", desc: "全34種のカードの真髄を極めし賢者" });
        }
        
        /** 2026/03/10 修正：未定義変数 p を winner に差し替え **/
        // --- 4. スカイ・ウォーカー (ディメンションとダッシュを併用) ---
        if (winner && winner.dimensionActive && winner.extraMoves > 0) {
            awards.push({ pid: 1, name: "🚀 スカイ・ウォーカー", desc: "次元と速度を支配し戦場を舞った" });
        }
    }


    /** 2026/03/09 修正：追加称号の最終判定 **/
    // --- 1. 被侵攻系 ---
    const invasionCount = matchStats.gateInvasionCount[winnerId] || 0;
    if (winner && invasionCount >= 5) awards.push({ pid: winnerId, name: "🏰 名高き聖域", desc: "5回以上侵入されながらも勝利" });
    else if (winner && invasionCount >= 3) awards.push({ pid: winnerId, name: "🏠 オープンハウス", desc: "3回以上侵入されながらも勝利" });
    else if (winner && invasionCount >= 1) awards.push({ pid: winnerId, name: "🛡️ 不屈の防衛線", desc: "侵入を許しながらも戦い抜いた証" });
    
    if (invasionCount >= 4) awards.push({ pid: winnerId, name: "💂 鉄の門番（自称）", desc: "何度も突破されたが心は折れず" });

    // --- 2. 無為自然 (一度も手札効果を使わなかった勝者) ---
    if (winner && (matchStats.handEffectUsedCount[winnerId] || 0) === 0) {
        awards.push({ pid: winnerId, name: "🧘 無為自然", desc: "一切の小細工なしに勝利を掴んだ" });
    }

    // --- 3. 国宝の使い手 (ファーストカードを一番多く使った勝者) ---
    const myFirstCount = matchStats.firstCardUseCount[winnerId] || 0;
    if (winner && myFirstCount >= 3) {
        awards.push({ pid: winnerId, name: "💎 国宝の使い手", desc: "ファーストカードを最大限に愛用した" });
    }

    // --- 4. ロック・ブレイカー ---
    if ((matchStats.lockBreakCount[winnerId] || 0) >= 3) {
        awards.push({ pid: winnerId, name: "🔨 ロック・ブレイカー", desc: "相手のロックを3枚以上粉砕・強奪した" });
    }

    return awards;
}

/**
 * 勝利演出の後にUI（おめでとう画面）を表示する
 */
function showVictoryUI(pid) {
    // ★追加：念のため、盤面の回転と拡大をここで完全にリセットする
    const appEl = document.getElementById('app');
    if (appEl) {
        appEl.style.transform = "none";
        appEl.classList.remove('final-v-zoom-active');
    }

    const winnerPl = players.find(p => p.id === pid);
    const overlay = document.getElementById('winner-overlay');
    const nameEl = document.getElementById('winner-name');
    const statsDisplay = document.getElementById('winner-stats-display');
    const lockDisplay = document.getElementById('winner-lock-display');

    if (nameEl) {
        nameEl.textContent = `${winnerPl.name} Wins!`;
        nameEl.className = "text-2xl font-bold mb-2 " + (winnerPl.color?.bg?.replace('bg-', 'text-') || 'text-yellow-600');
    }

    // --- アワード（勲章）の表示 ---
    if (statsDisplay) {
        const awards = calculateAwards(winnerPl.id);
        
        /** 2026/03/05 修正: ライト/ダークの判定に基づいた背景色と文字色の割り振りを反転修正 **/
        const cardBg = isLightMode ? 'bg-white/90 border-gray-200' : 'bg-black/40 backdrop-blur-md border-white/10';
        const titleColor = isLightMode ? 'text-gray-900' : 'text-white';
        const descColor = isLightMode ? 'text-gray-600' : 'text-gray-300';
        const nameColor = isLightMode ? 'text-blue-600' : 'text-yellow-400';

        statsDisplay.innerHTML = `
            <div class="grid grid-cols-3 gap-2 mt-4 px-2 justify-items-center">
                ${awards.map(a => {
                    const p = players.find(pl => pl.id === a.pid);
                    const isWinner = p.id === winnerPl.id;
                    return `
                        <div class="flex flex-col items-center ${cardBg} p-2 rounded-lg border ${isWinner ? 'border-yellow-500' : ''} shadow-xl w-full max-w-[100px]">
                            <span class="text-[8px] ${isWinner ? nameColor : 'text-gray-400'} font-bold mb-1 truncate w-full text-center">${p.name}</span>
                            <span class="text-[10px] font-black ${titleColor} text-center leading-tight">${a.name}</span>
                            <span class="text-[7px] ${descColor} mt-1 text-center leading-none italic">${a.desc}</span>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    }

    // --- ロックエリアの表示 ---
    if (lockDisplay) {
        lockDisplay.innerHTML = '';
        LOCK_ORDER.forEach(colorBase => {
            const cardInLock = collections[winnerPl.id][colorBase.id];
            const slot = document.createElement('div');
            slot.className = `w-10 h-10 rounded border border-white/40 flex items-center justify-center text-[8px] font-bold shadow-lg overflow-hidden relative victory-glow`;
            
            if (cardInLock && cardInLock.length > 0) {
                const card = cardInLock[cardInLock.length - 1];
                const imgPath = card.image || `images/card_${card.id}.webp`;
                slot.style.backgroundImage = `url('${imgPath}')`;
                slot.style.backgroundSize = 'cover';
            } else {
                slot.className += " bg-gray-900 opacity-20";
            }
            lockDisplay.appendChild(slot);
        });
    }

    // 最後に画面を表示！
    if (overlay) overlay.classList.remove('hidden');

    // ★重要：リザルト画面への遷移ボタンを確実に再接続する
    const winBtn = overlay.querySelector('button');
    if (winBtn) {
        winBtn.textContent = "リザルトを確認";
        winBtn.onclick = () => {
                overlay.classList.add('hidden');
                
                // 1. 色ごとの使用回数を集計 (colorStats の復元)
                const colorResults = BASE_COLORS.map(bc => {
                    let totalCount = 0;
                    // 全プレイヤーの使用スタッツから、その色のカードを探して合算
                    Object.values(cardUsageStats).forEach(pStats => {
                        Object.entries(pStats).forEach(([cardName, count]) => {
                            const cardData = CARD_DATABASE.find(d => d.name === cardName);
                            if (cardData && cardData.colorId === bc.id) totalCount += count;
                        });
                    });
                    return { id: bc.id, name: bc.name, bg: bc.bg, hex: bc.hex, count: totalCount };
                });

                // 2. MVPカードの選定 (最も多く使われたカード)
                let mvpName = "なし";
                let maxUsage = 0;
                Object.values(cardUsageStats).forEach(pStats => {
                    Object.entries(pStats).forEach(([cardName, count]) => {
                        if (count > maxUsage) {
                            maxUsage = count;
                            mvpName = cardName;
                        }
                    });
                });

                // 3. リザルトモーダルの呼び出し
                /** 2026/03/05 13:15 修正：リザルト表示後、画面が閉じられるタイミングでランク表示を行う **/
                if (typeof showResultModal === 'function') {
                    showResultModal(pid, {
                        time: window.currentPlayTime || 0,
                        turns: totalTurnCount,
                        colorStats: colorResults,
                        lockHistory: lockHistory,
                        mvp: mvpName
                    });

                    /** 2026/03/05 13:35 修正：リザルト→ランク→タイトルの遷移を完全保証 **/
                if (typeof showResultModal === 'function') {
                    showResultModal(pid, {
                        time: window.currentPlayTime || 0,
                        turns: totalTurnCount,
                        colorStats: colorResults,
                        lockHistory: lockHistory,
                        mvp: mvpName
                    });

                    const resultCloseBtn = document.getElementById('close-result-btn');
                    if (resultCloseBtn) {
                        resultCloseBtn.onclick = () => {
                            // リザルト画面を隠す
                            document.getElementById('result-overlay').classList.add('hidden');
                            
                            // 予約されていたランクデータがあれば、それを表示して、閉じられたらリロード
                            if (window.pendingRankUpdate) {
                                const { isWin, oldPoint, newPoint } = window.pendingRankUpdate;
                                // 第4引数（onFinish）にリロード処理を渡す
                                /** 2026/03/05 14:45 修正：ランク完了後にレベル表示を挟むチェーン構造 **/
                            if (window.pendingRankUpdate) {
                                const { isWin, oldPoint, newPoint } = window.pendingRankUpdate;
                                showPostGameRankModal(isWin, oldPoint, newPoint, () => {
                                    
                                    // ランクが終わったら次にレベルを表示
                                    if (window.pendingLevelUpdate) {
                                        showPostGameLevelModal(window.pendingLevelUpdate, () => {
                                            location.reload(); // すべて終わったらタイトルへ
                                        });
                                        window.pendingLevelUpdate = null;
                                    } else {
                                        location.reload();
                                    }
                                });
                                window.pendingRankUpdate = null;
                            } else {
                                location.reload();
                            }
                                window.pendingRankUpdate = null;
                            } else {
                                // ランク表示がない（テストモード以外など）場合は即リロード
                                location.reload();
                            }
                        };
                    }
                }
                }
            };
    }

    const peekBtn = document.getElementById('peek-board-container');
    if (peekBtn) peekBtn.classList.remove('hidden');
}


/**
 * ゲーム終了後のプロフィール更新処理
 * @param {string} winnerId - 勝利したプレイヤーのID
 */
/** 2026/03/05 10:35 修正：winnerId が数値(1)で渡されるケースに対応し、自分の勝利を正しく判定 **/
function updateProfileAfterGame(winnerId) {
    // 確実に最新のプロフィールをロードしてから更新を開始する
    if (typeof loadUserProfile === 'function') loadUserProfile();

    const isWin = (Number(winnerId) === 1); 
    const oldPoint = userProfile.rankPoint; // 変動前のポイントを記憶

    // 統計の基本更新（総試合数）
    userProfile.stats.totalGames++;

    /** 2026/03/05 11:45 修正：獲得ポイントの表示数値を実際の加算値と同期 **/
    let pointGained = 0; // 今回獲得（または減少）したポイント

    if (isWin) {
        userProfile.totalWins++;
        // ランク3以下は2pt、それ以外は1pt
        pointGained = (userProfile.rank <= 3) ? 2 : 1;
        userProfile.rankPoint += pointGained;

        /** 2026/03/05 14:10 修正：ランクアップ演出の実行タイミングを遅延させるための変更 **/
        if (userProfile.rankPoint >= 7 && userProfile.rank < 8) {
            userProfile.rank++;
            userProfile.rankPoint = 0; 
            addLog(`【RANK UP】ランク ${userProfile.rank} に到達しました！`);
            
            // 演出用データをwindowオブジェクトに予約（後でゲージ満タン時に使用）
            const rankNames = ["なし", "Red Apprentice", "Orange Survivor", "Yellow Seeker", "Green Guardian", "Blue Tactician", "Pink Specialist", "Purple Master", "SEVEN"];
            window.pendingRankUpEffect = { type: 'RANK', value: rankNames[userProfile.rank] };
        }

        // --- レベルの計算 (累積勝利数ベース) ---
        // 公式: レベル = floor(sqrt(累計勝利数 * 2)) + 1
        /** 2026/03/05 14:40 修正：レベルアップ演出を即時実行せず、進捗ゲージ表示用に予約 **/
        const oldLevel = userProfile.level;
        const newLevel = Math.floor(Math.sqrt(userProfile.totalWins * 2)) + 1;
        
        // 次のレベルに必要な累積勝利数を逆算 (n = ceil((L^2)/2))
        const getRequiredWins = (lv) => Math.ceil((Math.pow(lv, 2)) / 2);
        const currentExp = userProfile.totalWins;
        const nextLvExp = getRequiredWins(newLevel);
        const prevLvExp = getRequiredWins(oldLevel);

        window.pendingLevelUpdate = {
            oldLevel,
            newLevel,
            currentWins: currentExp,
            neededWins: nextLvExp,
            baseWins: prevLvExp,
            isLevelUp: newLevel > oldLevel
        };

        if (newLevel > oldLevel) {
            userProfile.level = newLevel;
            addLog(`【LEVEL UP】Lv.${newLevel} になりました！`);
        }
    } else {
        userProfile.rankPoint = Math.max(0, userProfile.rankPoint - 1);
    }

    /** 2026/03/05 11:15 修正：演出用モーダルに渡す勝敗フラグを isWin に固定 **/
    /** 2026/03/05 13:10 修正：ランクモーダルの自動表示を停止。リザルト後に表示するためデータをwindowに保管 **/
    const newPoint = userProfile.rankPoint;
    window.pendingRankUpdate = { isWin, oldPoint, newPoint }; // リザルト終了時に使うためのデータを一時保存


    /** 2026/03/10 修正：Color Style（カラー傾向）が集計されないバグを修正 **/
    
    // 1. 集計用データの準備
    if (!userProfile.stats.colorUsage) userProfile.stats.colorUsage = {};
    const p1Stats = window.cardUsageStats ? (window.cardUsageStats[1] || window.cardUsageStats['p1']) : null;

    if (p1Stats) {
        for (const cardName in p1Stats) {
            const cardData = CARD_DATABASE.find(c => c.name === cardName);
            if (cardData && cardData.colorId) {
                // 使用回数を数値として加算
                const useCount = Number(p1Stats[cardName]) || 0;
                userProfile.stats.colorUsage[cardData.colorId] = (userProfile.stats.colorUsage[cardData.colorId] || 0) + useCount;
            }
        }
        console.log("Color Style Updated:", userProfile.stats.colorUsage);
    }

    // --- ここで称号判定やMVP特定を既に行っているはずなので、最後に一度だけ保存 ---
    saveUserProfile();
    console.log("All Profile Stats Saved.");

    // データの保存（game_state.jsで定義した関数を呼び出し）
    // --- 外科手術的修正：新しく獲得した称号を保存する ---
    // 称号獲得の判定： pid が数値の 1 か、文字列の 'p1' かを両方許容する
    const currentAwards = calculateAwards(winnerId);
    currentAwards.forEach(award => {
        const isMyAward = (award.pid === 1 || award.pid === 'p1');
        if (isMyAward && !userProfile.unlockedTitles.includes(award.name)) {
            userProfile.unlockedTitles.push(award.name);
            addLog(`🎖️ 新しい称号「${award.name}」を獲得しました！`);
        }
    });

    // --- 外科手術的修正：通算MVPカードの特定 ---
    // MVPカードの判定：今回の対局結果をマージする前に、stats構造が存在するか確認
    if (!userProfile.stats) userProfile.stats = {};
    if (!userProfile.stats.cardUsageCount) userProfile.stats.cardUsageCount = {};

    // --- カラー傾向(Color Style)の更新箇所 ---
    if (window.cardUsageStats) {
        // IDが 1 (数値) または 'p1' (文字列) のどちらでも取得できるように修正
        const p1Usage = window.cardUsageStats[1] || window.cardUsageStats['p1'];
        if (p1Usage) {
            for (const cardName in p1Usage) {
                const card = CARD_DATABASE.find(c => c.name === cardName);
                if (card && card.colorId) {
                    userProfile.stats.colorUsage[card.colorId] = (userProfile.stats.colorUsage[card.colorId] || 0) + p1Usage[cardName];
                }
            }
        }
    }

    // --- 通算MVPカードの特定・更新箇所 ---
    /** 2026/03/10 修正：MVP回数が0になるバグを修正（構造の統一） **/
    // 1. stats構造の初期化を確実に行う
    if (!userProfile.stats) userProfile.stats = {};
    // 表示側の showUserProfileModal が参照している名前に統一
    if (!userProfile.stats.cardUsageCount) userProfile.stats.cardUsageCount = {};
    
    if (window.cardUsageStats) {
        // IDが 1 (数値) または 'p1' (文字列) のどちらでも取得
        const p1Usage = window.cardUsageStats[1] || window.cardUsageStats['p1'];
        if (p1Usage) {
            for (const cardName in p1Usage) {
                // 通算使用回数を加算
                const count = Number(p1Usage[cardName]) || 0;
                userProfile.stats.cardUsageCount[cardName] = (userProfile.stats.cardUsageCount[cardName] || 0) + count;
            }
        }
    }

    // 2. 最多使用カード（MVP）の特定と回数の確定
    let topCardName = null;
    let maxUsage = 0;

    for (const [name, count] of Object.entries(userProfile.stats.cardUsageCount)) {
        if (count > maxUsage) {
            maxUsage = count;
            topCardName = name;
        }
    }
    
    if (topCardName) {
        // mvpCardには「カード名」を入れ、回数は cardUsageCount 側で保持する
        userProfile.stats.mvpCard = topCardName;
        console.log(`MVP確定: ${topCardName} (通算 ${maxUsage} 回)`);
    }

    // 3. データの保存を確実に実行
    saveUserProfile();
 
    console.log("Profile updated and saved:", userProfile);
}

/**
 * 2026/03/08 01:05 修正
 * 1. AI強制再起動用関数 forceResumeAI を追加。
 * 2. 停止原因となるフラグ(isAutoProcessing等)を強制リセットし、フェイズに応じたAIルーチンを再点火する。
 */

// --- 修正箇所：ファイルの最後の方（checkWin関数の後など）に追加 ---

/**
 * [外科手術的追加] AIが停止した際に強制的にフラグをリセットし、処理を続行させる
 */
function forceResumeAI() {
    addLog(`<span class="text-red-400">🚨 システム：AI強制再起動を実行します...</span>`);
    
    // 1. 進行を妨げている可能性があるフラグを強制リセット
    isAutoProcessing = false;
    isHandEffectProcessing = false;
    isPlacingCard = false;
    
    // モーダルが残っていると進行を妨げるため、選択モード中ならキャンセルを試みる
    if (typeof cancelSelection === 'function') cancelSelection(true);
    
    const p = players[turn];
    
    // 2. 現在のフェイズに応じて適切なAI関数を呼び出す
    if (currentPhase === PHASE.LOCK) {
        if (typeof autoLockPhase === 'function') autoLockPhase(p);
    } else if (currentPhase === PHASE.HAND) {
        if (typeof autoHandPhase === 'function') autoHandPhase(p);
    } else if (currentPhase === PHASE.MOVE) {
        if (typeof autoMovePhase === 'function') autoMovePhase(p);
    } else {
        // フェイズが不明な場合は次へ進める
        if (typeof nextPhase === 'function') nextPhase(true);
    }
}