use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};

use crate::error::{AppError, AppResult};

pub fn hash_password(password: &str) -> AppResult<String> {
    let salt = SaltString::generate(&mut OsRng);
    let argon2 = Argon2::default();
    let hash = argon2
        .hash_password(password.as_bytes(), &salt)
        .map_err(|err| AppError::Anyhow(err.into()))?;
    Ok(hash.to_string())
}

pub fn verify_password(password: &str, password_hash: &str) -> AppResult<()> {
    let parsed_hash =
        PasswordHash::new(password_hash).map_err(|err| AppError::Anyhow(err.into()))?;
    Argon2::default()
        .verify_password(password.as_bytes(), &parsed_hash)
        .map_err(|_| AppError::Unauthorized)?;
    Ok(())
}
