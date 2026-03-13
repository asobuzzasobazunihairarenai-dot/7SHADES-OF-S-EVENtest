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
    let loginSuccess = false; // ★追加：成功チェック用フラグ

    try {
        const result = await auth.signInWithPopup(provider);
        const user = result.user;

        userProfile.name = user.displayName || userProfile.name;
        if (user.photoURL) {
            userProfile.icon = user.photoURL;
        }
        
        userProfile.isLoggedIn = true;
        userProfile.uid = user.uid;

        saveUserProfile();
        
        if (typeof updateProfileButtonVisual === 'function') {
            updateProfileButtonVisual(); 
        }
        
        loginSuccess = true; // ★ここで成功を確定させる
        
        addLog(`${userProfile.name} としてログイン。データを同期します。`);
        /* 2026/03/13 修正：ログイン後の遷移をホーム画面に強制固定 */
        const titleOverlay = document.getElementById('title-overlay');
        const setupOverlay = document.getElementById('setup-overlay');
        const homeScreen = document.getElementById('home-screen');

        if (titleOverlay) titleOverlay.classList.add('hidden');
        if (setupOverlay) setupOverlay.classList.add('hidden'); // ★ここが重要：人数設定を隠す
        
        if (homeScreen) {
            homeScreen.classList.remove('hidden');
            // ホーム画面の名前をGoogle名に更新
            const nameDisplay = document.getElementById('home-user-name');
            if (nameDisplay) nameDisplay.textContent = userProfile.name;
        }

        addLog(`${userProfile.name} としてログイン。ホーム画面へ移動します。`); 
        
    } catch (error) {
        console.error("Login Error Details:", error);

        // ★修正：ログインに成功している(loginSuccessがtrue)なら、後の細かいエラーは無視
        if (loginSuccess) return;

        // ユーザーが自ら閉じた場合以外で、かつ本当に失敗している時だけアラートを出す
        if (error.code !== 'auth/popup-closed-by-user' && error.code !== 'auth/cancelled-popup-request') {
            alert("ログイン処理中に通知がありました。反映状況を確認してください。");
        }
    }
}