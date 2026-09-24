use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::Mutex;
use std::time::Duration;

use crate::command_error::CommandError;

const HTML: &str = include_str!("video-embed.html");
const SCRIPT: &str = include_str!("video-embed.js");
const YOUTUBE_CSP: &str = "default-src 'none'; script-src 'self' https://www.youtube.com https://s.ytimg.com; frame-src https://www.youtube.com; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors tauri: http://tauri.localhost https://tauri.localhost http://127.0.0.1:*";
const VIMEO_CSP: &str = "default-src 'none'; script-src 'self' https://player.vimeo.com; frame-src https://player.vimeo.com; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors tauri: http://tauri.localhost https://tauri.localhost http://127.0.0.1:*";
const RESOURCE_CSP: &str = "default-src 'none'; frame-ancestors 'none'";

#[derive(Default)]
pub struct VideoEmbedServer(Mutex<Option<String>>);

// Provider SDKs run on this isolated page, never in the main window; YouTube also needs an HTTP referrer.
#[tauri::command]
pub fn video_embed_origin(
    state: tauri::State<'_, VideoEmbedServer>,
) -> Result<String, CommandError> {
    let unavailable = |e: std::io::Error| CommandError::new("video_host_unavailable", e);
    let mut origin = state
        .0
        .lock()
        .map_err(|e| CommandError::new("video_host_unavailable", e))?;
    if let Some(origin) = origin.as_ref() {
        return Ok(origin.clone());
    }
    let listener = TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, 0)).map_err(unavailable)?;
    let address = listener.local_addr().map_err(unavailable)?;
    let url = format!("http://{address}");
    std::thread::Builder::new()
        .name("video-embed".into())
        .spawn(move || {
            for stream in listener.incoming().flatten() {
                let _ = serve(stream, &address.to_string());
            }
        })
        .map_err(unavailable)?;
    *origin = Some(url.clone());
    Ok(url)
}

type Response = (&'static str, &'static str, &'static str, &'static str);

fn response(request: &str, host: &str) -> Response {
    let mut lines = request.lines();
    let first = lines.next().unwrap_or_default();
    let host_matches = lines.any(|line| {
        line.split_once(':')
            .is_some_and(|(name, value)| name.eq_ignore_ascii_case("host") && value.trim() == host)
    });
    if !host_matches {
        return ("403 Forbidden", "text/plain", "Forbidden", RESOURCE_CSP);
    }
    // Each provider gets its own page so neither policy admits the other provider's scripts.
    match first {
        "GET /youtube.html HTTP/1.1" => ("200 OK", "text/html; charset=utf-8", HTML, YOUTUBE_CSP),
        "GET /vimeo.html HTTP/1.1" => ("200 OK", "text/html; charset=utf-8", HTML, VIMEO_CSP),
        "GET /video-embed.js HTTP/1.1" => (
            "200 OK",
            "text/javascript; charset=utf-8",
            SCRIPT,
            RESOURCE_CSP,
        ),
        _ => ("404 Not Found", "text/plain", "Not found", RESOURCE_CSP),
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
    let (status, mime, body, csp) = response(&String::from_utf8_lossy(&request), host);
    write!(stream, "HTTP/1.1 {status}\r\nContent-Type: {mime}\r\nContent-Length: {}\r\nContent-Security-Policy: {csp}\r\nReferrer-Policy: strict-origin-when-cross-origin\r\nX-Content-Type-Options: nosniff\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n{body}", body.len())
}

#[cfg(test)]
#[path = "video_embed_tests.rs"]
mod tests;
