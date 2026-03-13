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
    try {
        const result = await auth.signInWithPopup(provider);
        const user = result.user;

        // Google情報を反映
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
        
        addLog(`${userProfile.name} としてログイン。データを同期します。`);
        document.getElementById('title-overlay').classList.add('hidden');
        showHomeScreen(); 
        
    } catch (error) {
        console.error("Login Error:", error);
        if (error.code !== 'auth/popup-closed-by-user') {
            alert("ログインに失敗しました。Firebaseの承認ドメイン設定を確認してください。");
        }
    }
}