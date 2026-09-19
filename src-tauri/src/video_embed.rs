use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::Mutex;
use std::time::Duration;

const HTML: &str = include_str!("youtube-embed.html");
const SCRIPT: &str = include_str!("youtube-embed.js");
const CSP: &str = "default-src 'none'; script-src 'self' https://www.youtube.com https://s.ytimg.com; frame-src https://www.youtube.com; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors tauri: http://tauri.localhost https://tauri.localhost http://127.0.0.1:*";

#[derive(Default)]
pub struct VideoEmbedServer(Mutex<Option<String>>);

// YouTube requires an HTTP referrer; this isolated page has no filesystem or Tauri IPC access.
#[tauri::command]
pub fn video_embed_origin(state: tauri::State<'_, VideoEmbedServer>) -> Result<String, String> {
    let mut origin = state.0.lock().map_err(|e| e.to_string())?;
    if let Some(origin) = origin.as_ref() {
        return Ok(origin.clone());
    }
    let listener =
        TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, 0)).map_err(|e| e.to_string())?;
    let address = listener.local_addr().map_err(|e| e.to_string())?;
    let url = format!("http://{address}");
    std::thread::Builder::new()
        .name("video-embed".into())
        .spawn(move || {
            for stream in listener.incoming().flatten() {
                let _ = serve(stream, &address.to_string());
            }
        })
        .map_err(|e| e.to_string())?;
    *origin = Some(url.clone());
    Ok(url)
}

fn response(request: &str, host: &str) -> (&'static str, &'static str, &'static str) {
    let mut lines = request.lines();
    let first = lines.next().unwrap_or_default();
    let host_matches = lines.any(|line| {
        line.split_once(':')
            .is_some_and(|(name, value)| name.eq_ignore_ascii_case("host") && value.trim() == host)
    });
    if !host_matches {
        return ("403 Forbidden", "text/plain", "Forbidden");
    }
    match first {
        "GET /youtube.html HTTP/1.1" => ("200 OK", "text/html; charset=utf-8", HTML),
        "GET /youtube.js HTTP/1.1" => ("200 OK", "text/javascript; charset=utf-8", SCRIPT),
        _ => ("404 Not Found", "text/plain", "Not found"),
    }
}

fn serve(mut stream: TcpStream, host: &str) -> std::io::Result<()> {
    stream.set_read_timeout(Some(Duration::from_secs(1)))?;
    stream.set_write_timeout(Some(Duration::from_secs(1)))?;
    let mut request = Vec::new();
    let mut buffer = [0; 1024];
    while request.len() < 8192 && !request.windows(4).any(|part| part == b"\r\n\r\n") {
        let count = stream.read(&mut buffer)?;
        if count == 0 {
            break;
        }
        request.extend_from_slice(&buffer[..count]);
    }
    let (status, mime, body) = response(&String::from_utf8_lossy(&request), host);
    write!(stream, "HTTP/1.1 {status}\r\nContent-Type: {mime}\r\nContent-Length: {}\r\nContent-Security-Policy: {CSP}\r\nReferrer-Policy: strict-origin-when-cross-origin\r\nX-Content-Type-Options: nosniff\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n{body}", body.len())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serves_only_fixed_player_resources_to_loopback_host() {
        assert_eq!(
            response(
                "GET /youtube.html HTTP/1.1\r\nHost: 127.0.0.1:1234\r\n\r\n",
                "127.0.0.1:1234"
            )
            .0,
            "200 OK"
        );
        for request in [
            "GET /youtube.html HTTP/1.1\r\nHost: attacker.example\r\n\r\n",
            "GET /youtube.js HTTP/1.1\r\n\r\n",
        ] {
            assert_eq!(response(request, "127.0.0.1:1234").0, "403 Forbidden");
        }
        for path in [
            "/",
            "/../../Cargo.toml",
            "/youtube.html?url=https://example.org",
            "/document.canvaslide",
        ] {
            assert_eq!(
                response(
                    &format!("GET {path} HTTP/1.1\r\nHost: 127.0.0.1:1234\r\n\r\n"),
                    "127.0.0.1:1234"
                )
                .0,
                "404 Not Found"
            );
        }
        assert_eq!(
            response(
                "POST /youtube.html HTTP/1.1\r\nHost: 127.0.0.1:1234\r\n\r\n",
                "127.0.0.1:1234"
            )
            .0,
            "404 Not Found"
        );
    }
}
