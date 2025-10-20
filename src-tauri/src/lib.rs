use tauri::Manager;

mod auth;
mod commands;
mod error;
mod filesystem;
mod ml_bridge;
mod models;
mod state;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            commands::bootstrap,
            commands::create_project,
            commands::list_projects,
            commands::update_settings,
            commands::transliterate_english_to_tamil,
            commands::refresh_model_inventory,
            commands::list_project_files,
            commands::load_markdown_file,
            commands::save_markdown_file,
            commands::copy_project_asset,
            commands::register_user,
            commands::login_user,
            commands::logout_user,
            commands::current_user,
            commands::transcribe_audio_file,
            commands::record_from_microphone,
            commands::synthesize_speech,
            commands::generate_ai_scene,
        ])
        .setup(|app| {
            #[cfg(debug_assertions)]
            {
                app.handle()
                    .plugin(
                        tauri_plugin_log::Builder::default()
                            .level(log::LevelFilter::Info)
                            .build(),
                    )
                    .map_err(|err| -> Box<dyn std::error::Error> { Box::new(err) })?;
            }

            app.handle()
                .plugin(tauri_plugin_dialog::init())
                .map_err(|err| -> Box<dyn std::error::Error> { Box::new(err) })?;

            let state = tauri::async_runtime::block_on(state::initialize_state())
                .map_err(|err| -> Box<dyn std::error::Error> { Box::new(err) })?;

            crate::filesystem::ensure_projects_root(&state.storage_root)
                .map(|_| ())
                .map_err(|err| -> Box<dyn std::error::Error> { Box::new(err) })?;

            app.manage(state);

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
