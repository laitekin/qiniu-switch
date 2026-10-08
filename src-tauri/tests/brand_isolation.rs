use qiniu_switch_lib::Database;

#[test]
fn creates_a_new_qiniu_database_without_reading_original_data() {
    let home = tempfile::tempdir().unwrap();
    let original = home.path().join(".cc-switch");
    std::fs::create_dir(&original).unwrap();
    let original_db = original.join("cc-switch.db");
    // An invalid original database must not interfere with a fresh Qiniu installation.
    std::fs::write(&original_db, b"original-data-untouched").unwrap();
    std::env::set_var("QINIU_SWITCH_TEST_HOME", home.path());
    let db = Database::init().unwrap();
    drop(db);
    assert!(home.path().join(".qiniu-switch/qiniu-switch.db").is_file());
    assert_eq!(
        std::fs::read(&original_db).unwrap(),
        b"original-data-untouched"
    );
    assert!(!home.path().join(".qiniu-switch/cc-switch.db").exists());
    std::env::remove_var("QINIU_SWITCH_TEST_HOME");
}
