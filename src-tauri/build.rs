fn main() {
    // Tauri embeds icons at compile time; replacing them must invalidate cached builds.
    println!("cargo:rerun-if-changed=icons");
    tauri_build::build()
}
