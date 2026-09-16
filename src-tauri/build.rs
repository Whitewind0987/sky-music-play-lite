use std::env;
use std::path::PathBuf;

fn configure_windows_test_manifest() {
    println!("cargo:rerun-if-changed=windows-test-manifest.xml");

    let target_os = env::var("CARGO_CFG_TARGET_OS").unwrap_or_default();
    let target_env = env::var("CARGO_CFG_TARGET_ENV").unwrap_or_default();
    if target_os != "windows" || target_env != "msvc" {
        return;
    }

    let manifest_dir = PathBuf::from(
        env::var_os("CARGO_MANIFEST_DIR").expect("Cargo did not provide CARGO_MANIFEST_DIR"),
    );
    let test_manifest = manifest_dir.join("windows-test-manifest.xml");

    // Cargo's unit-test harness is the library target compiled with `--test`,
    // not a standalone `[[test]]` target, so `rustc-link-arg-tests` does not
    // apply to it. Package link arguments reach that harness; tauri-build adds
    // the production-only application manifest to the normal binary as well.
    println!("cargo:rustc-link-arg=/MANIFEST:EMBED");
    println!(
        "cargo:rustc-link-arg=/MANIFESTINPUT:{}",
        test_manifest.display()
    );
    // The Tauri binary already receives an embedded production manifest via
    // tauri-build's resource library. Prevent link.exe from generating a
    // second resource for that binary while leaving the library test harness
    // on the test-only manifest above.
    println!("cargo:rustc-link-arg-bin=sky-music-play-lite=/MANIFEST:NO");
}

fn main() {
    configure_windows_test_manifest();

    let windows = tauri_build::WindowsAttributes::new().app_manifest(
        r#"
<assembly xmlns="urn:schemas-microsoft-com:asm.v1" manifestVersion="1.0">
  <dependency>
    <dependentAssembly>
      <assemblyIdentity
        type="win32"
        name="Microsoft.Windows.Common-Controls"
        version="6.0.0.0"
        processorArchitecture="*"
        publicKeyToken="6595b64144ccf1df"
        language="*"
      />
    </dependentAssembly>
  </dependency>
  <trustInfo xmlns="urn:schemas-microsoft-com:asm.v3">
    <security>
      <requestedPrivileges>
        <requestedExecutionLevel level="requireAdministrator" uiAccess="false" />
      </requestedPrivileges>
    </security>
  </trustInfo>
</assembly>
"#,
    );

    let attributes = tauri_build::Attributes::new().windows_attributes(windows);

    tauri_build::try_build(attributes).expect("failed to run tauri build script");
}
