/**
 * 7 SHADES OF S:EVEN - firebase_init.js
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


// ステップ2でコピーした設定値に書き換えてください
/* 2026/03/13 修正：Firebase設定値を本物の値に更新 */
const firebaseConfig = {
    apiKey: "AIzaSyCBOZ1lA3c_OEnkwluWFg0X_PO9hcKPO98",
    authDomain: "shades-of-seven-db.firebaseapp.com",
    projectId: "shades-of-seven-db",
    storageBucket: "shades-of-seven-db.firebasestorage.app",
    messagingSenderId: "614177091427",
    appId: "1:614177091427:web:479f6525fc28d9a5ed6d56",
    measurementId: "G-CHX6LEMQKE"
};

// Firebase 初期化
firebase.initializeApp(firebaseConfig);

// 便利なショートカットを作成
const auth = firebase.auth();
const db = firebase.firestore();

// ログイン状態の監視
auth.onAuthStateChanged(user => {
    if (user) {
        console.log("ログイン中:", user.displayName);
        // userProfileの復元など
        userProfile.isLoggedIn = true;
        userProfile.uid = user.uid;
    } else {
        console.log("未ログイン");
        userProfile.isLoggedIn = false;
    }
});

/* Googleログイン処理 */
async function loginWithGoogle() {
    const provider = new firebase.auth.GoogleAuthProvider();
    let loginSuccess = false; 

    try {
        const result = await auth.signInWithPopup(provider);
        const user = result.user;

        // 1. Googleの基本情報を反映
        userProfile.name = user.displayName || userProfile.name;
        if (user.photoURL) {
            userProfile.icon = user.photoURL;
        }
        userProfile.isLoggedIn = true;
        userProfile.uid = user.uid;

        // 2. ★追加：クラウド（Firestore）から過去の戦績をロード
        addLog(`データを同期中...`);
        if (typeof loadProfileFromCloud === 'function') {
            await loadProfileFromCloud(); // ここで過去の勝利数やランクが userProfile に上書きされます
        }

        // 3. ローカル保存とUI更新
        saveUserProfile();
        if (typeof updateProfileButtonVisual === 'function') {
            updateProfileButtonVisual(); 
        }
        
        // 4. 全ての同期が完了してから「成功」とする
        loginSuccess = true; 
        
        // 5. 画面遷移
        const titleOverlay = document.getElementById('title-overlay');
        const setupOverlay = document.getElementById('setup-overlay');
        const homeScreen = document.getElementById('home-screen');

        if (titleOverlay) titleOverlay.classList.add('hidden');
        if (setupOverlay) setupOverlay.classList.add('hidden'); 
        
        if (homeScreen) {
            homeScreen.classList.remove('hidden');
            const nameDisplay = document.getElementById('home-user-name');
            if (nameDisplay) nameDisplay.textContent = userProfile.name;
        }

        addLog(`${userProfile.name} としてログイン。おかえりなさい！`); 
        
    } catch (error) {
        console.error("Login Error Details:", error);

        if (loginSuccess) return;

        if (error.code !== 'auth/popup-closed-by-user' && error.code !== 'auth/cancelled-popup-request') {
            alert("ログイン処理中に通知がありました。反映状況を確認してください。");
        }
    }
}

/**
 * 2026/03/13 追加：クラウド（Firestore）にユーザーデータを保存
 */
async function syncProfileToCloud() {
    if (!userProfile.isLoggedIn || !userProfile.uid) return;

    try {
        // users コレクション内の、自分のUIDという名前のドキュメントに保存
        await db.collection("users").doc(userProfile.uid).set({
            name: userProfile.name,
            icon: userProfile.icon,
            stats: userProfile.stats, // 勝利数や勝率など
            lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true }); // merge: true にすると、既存のデータを消さずに上書き・追加できる

        console.log("Cloud Sync: Success!");
    } catch (error) {
        console.error("Cloud Sync Error:", error);
    }
}

/**
 * 2026/03/13 追加：クラウドからデータを読み込む
 */
async function loadProfileFromCloud() {
    if (!userProfile.isLoggedIn || !userProfile.uid) return;

    try {
        const doc = await db.collection("users").doc(userProfile.uid).get();
        if (doc.exists) {
            const cloudData = doc.data();
            // クラウドのデータで上書き（必要に応じてどちらを優先するか調整可能）
            userProfile.stats = cloudData.stats || userProfile.stats;
            userProfile.name = cloudData.name || userProfile.name;
            userProfile.icon = cloudData.icon || userProfile.icon;
            
            saveUserProfile(); // ローカル（localStorage）にも反映
            updateProfileButtonVisual();
            console.log("Cloud Data Loaded:", cloudData);
        }
    } catch (error) {
        console.error("Load Cloud Data Error:", error);
    }
}