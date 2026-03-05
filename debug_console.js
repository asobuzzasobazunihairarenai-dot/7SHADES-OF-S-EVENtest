/**
 * 7 SHADES OF S:EVEN - debug_console.js
 * 【共通定義】
 * - 到達: 表向きカードの上に駒が置かれた瞬間
 * - 到達効果: 到達時に発動。原則「効果解決」→「カード獲得」の順。
 * - 例外: カードに処遇（場に残る、破棄等）が書かれている場合はそれに従う。
 */



(function() {
    // スタイル定義（JS内で完結させ、着脱を容易にします）
    const style = document.createElement('style');
    style.textContent = `
        #debug-console-btn {
            position: fixed; bottom: 10px; right: 10px; z-index: 9999;
            background: #374151; color: #fff; border: 1px solid #4b5563;
            padding: 5px 10px; border-radius: 5px; cursor: pointer;
            font-family: monospace; font-size: 12px; opacity: 0.8;
        }
        #debug-console-btn:hover { opacity: 1; }
        #debug-console-overlay {
            position: fixed; bottom: 0; left: 0; width: 100%; height: 30vh;
            background: rgba(0, 0, 0, 0.9); color: #0f0; z-index: 10000;
            font-family: monospace; font-size: 12px; display: flex; flex-direction: column;
            border-top: 2px solid #4b5563; transition: transform 0.3s;
            transform: translateY(100%);
        }
        #debug-console-overlay.open { transform: translateY(0); }
        .dc-header {
            padding: 5px 10px; background: #1f2937; border-bottom: 1px solid #374151;
            display: flex; justify-content: space-between; align-items: center;
        }
        .dc-content {
            flex: 1; overflow-y: auto; padding: 10px; white-space: pre-wrap; word-break: break-all;
        }
        .dc-log-row { margin-bottom: 4px; border-bottom: 1px solid #333; padding-bottom: 2px; }
        .dc-error { color: #ff5555; background: rgba(50,0,0,0.5); }
        .dc-warn { color: #facc15; }
        .dc-info { color: #60a5fa; }
        .dc-btn {
            background: #374151; color: white; border: 1px solid #6b7280;
            padding: 2px 8px; border-radius: 3px; cursor: pointer; font-size: 10px; margin-left: 5px;
        }
        .dc-btn:hover { background: #4b5563; }
    `;
    document.head.appendChild(style);

    // UI要素作成
    const btn = document.createElement('div');
    btn.id = 'debug-console-btn';
    btn.textContent = '🐞 Debug';
    document.body.appendChild(btn);

    const overlay = document.createElement('div');
    overlay.id = 'debug-console-overlay';
    overlay.innerHTML = `
        <div class="dc-header">
            <div>
                <span style="font-weight:bold; color:#fff;">Debug Console</span>
                <span id="dc-status" style="margin-left:10px; color:#aaa;">Ready</span>
            </div>
            <div>
                <button class="dc-btn" id="dc-copy">ログをコピー</button>
                <button class="dc-btn" id="dc-clear">クリア</button>
                <button class="dc-btn" id="dc-close">▼ 閉じる</button>
            </div>
        </div>
        <div class="dc-content" id="dc-content"></div>
    `;
    document.body.appendChild(overlay);

    const contentDiv = document.getElementById('dc-content');
    let logs = [];

    // ログ追加関数
    function addLogEntry(type, msg, details = '') {
        const div = document.createElement('div');
        div.className = `dc-log-row dc-${type}`;
        const time = new Date().toLocaleTimeString();
        const text = `[${time}] [${type.toUpperCase()}] ${msg} ${details}`;
        div.textContent = text;
        contentDiv.appendChild(div);
        contentDiv.scrollTop = contentDiv.scrollHeight;
        logs.push(text);

        // エラーなら自動で開く
        if (type === 'error') {
            overlay.classList.add('open');
            document.getElementById('dc-status').textContent = '⚠️ Error Detected!';
            document.getElementById('dc-status').style.color = '#ff5555';
        }
    }

    // エラーハンドリング (Global)
    window.onerror = function(message, source, lineno, colno, error) {
        const details = `\nLocation: ${source}:${lineno}:${colno}`;
        const stack = error && error.stack ? `\nStack: ${error.stack}` : '';
        addLogEntry('error', message, details + stack);
        return false; // デフォルトの処理も走らせる
    };

    // Promise Rejection ハンドリング
    window.onunhandledrejection = function(event) {
        addLogEntry('error', `Unhandled Rejection: ${event.reason}`);
    };

    // console.errorのフック (任意: 必要ならコメントアウトを外す)
    /*
    const originalError = console.error;
    console.error = function(...args) {
        addLogEntry('error', args.join(' '));
        originalError.apply(console, args);
    };
    */

    // イベントリスナー
    btn.onclick = () => overlay.classList.toggle('open');
    document.getElementById('dc-close').onclick = () => overlay.classList.remove('open');
    document.getElementById('dc-clear').onclick = () => {
        contentDiv.innerHTML = '';
        logs = [];
        document.getElementById('dc-status').textContent = 'Cleared';
        document.getElementById('dc-status').style.color = '#aaa';
    };
    
    document.getElementById('dc-copy').onclick = () => {
        const textToCopy = "以下、デバッグコンソールのログです：\n\n" + logs.join('\n');
        navigator.clipboard.writeText(textToCopy).then(() => {
            const status = document.getElementById('dc-status');
            const originalText = status.textContent;
            status.textContent = 'Copied to Clipboard!';
            status.style.color = '#4ade80';
            setTimeout(() => {
                status.textContent = originalText;
                status.style.color = '#aaa';
            }, 2000);
        }).catch(err => {
            alert('コピーに失敗しました');
        });
    };

    addLogEntry('info', 'Debug console initialized.');
})();