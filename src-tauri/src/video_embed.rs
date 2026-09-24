use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::Mutex;
use std::time::Duration;

const HTML: &str = include_str!("video-embed.html");
const SCRIPT: &str = include_str!("video-embed.js");
const YOUTUBE_CSP: &str = "default-src 'none'; script-src 'self' https://www.youtube.com https://s.ytimg.com; frame-src https://www.youtube.com; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors tauri: http://tauri.localhost https://tauri.localhost http://127.0.0.1:*";
const VIMEO_CSP: &str = "default-src 'none'; script-src 'self' https://player.vimeo.com; frame-src https://player.vimeo.com; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors tauri: http://tauri.localhost https://tauri.localhost http://127.0.0.1:*";
const RESOURCE_CSP: &str = "default-src 'none'; frame-ancestors 'none'";

#[derive(Default)]
pub struct VideoEmbedServer(Mutex<Option<String>>);

// Provider SDKs run on this isolated page, never in the main window; YouTube also needs an HTTP referrer.
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
mod tests {
    use super::*;
    use std::collections::BTreeMap;

    const HOST: &str = "127.0.0.1:1234";

    fn get(path: &str) -> Response {
        response(
            &format!("GET {path} HTTP/1.1\r\nHost: {HOST}\r\n\r\n"),
            HOST,
        )
    }

    #[test]
    fn serves_only_fixed_player_resources_to_loopback_host() {
        for path in ["/youtube.html", "/vimeo.html", "/video-embed.js"] {
            assert_eq!(get(path).0, "200 OK", "{path}");
        }
        for request in [
            "GET /youtube.html HTTP/1.1\r\nHost: attacker.example\r\n\r\n",
            "GET /vimeo.html HTTP/1.1\r\nHost: attacker.example\r\n\r\n",
            "GET /video-embed.js HTTP/1.1\r\n\r\n",
        ] {
            assert_eq!(response(request, HOST).0, "403 Forbidden");
        }
        for path in [
            "/",
            "/youtube.js",
            "/../../Cargo.toml",
            "/youtube.html?url=https://example.org",
            "/vimeo.html?url=https://example.org",
            "/document.canvaslide",
        ] {
            assert_eq!(get(path).0, "404 Not Found", "{path}");
        }
        assert_eq!(
            response(
                &format!("POST /vimeo.html HTTP/1.1\r\nHost: {HOST}\r\n\r\n"),
                HOST
            )
            .0,
            "404 Not Found"
        );
    }

    // Exercise serve() over a socket so the header actually written is what gets checked.
    fn served_policy(path: &str) -> BTreeMap<String, String> {
        let listener = TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, 0)).unwrap();
        let host = listener.local_addr().unwrap().to_string();
        let server = {
            let host = host.clone();
            std::thread::spawn(move || serve(listener.accept().unwrap().0, &host).unwrap())
        };
        let mut client = TcpStream::connect(&host).unwrap();
        write!(client, "GET {path} HTTP/1.1\r\nHost: {host}\r\n\r\n").unwrap();
        let mut reply = String::new();
        client.read_to_string(&mut reply).unwrap();
        server.join().unwrap();
        let header = reply
            .lines()
            .find_map(|line| line.strip_prefix("Content-Security-Policy: "))
            .unwrap_or_default();
        header
            .split(';')
            .filter_map(|directive| directive.trim().split_once(' '))
            .map(|(name, value)| (name.to_owned(), value.to_owned()))
            .collect()
    }

    fn policy(directives: &[(&str, &str)]) -> BTreeMap<String, String> {
        directives
            .iter()
            .map(|(name, value)| (name.to_string(), value.to_string()))
            .collect()
    }

    #[test]
    fn each_player_page_admits_only_its_own_provider() {
        let shared = [
            ("default-src", "'none'"),
            ("style-src", "'unsafe-inline'"),
            ("base-uri", "'none'"),
            (
                "frame-ancestors",
                "tauri: http://tauri.localhost https://tauri.localhost http://127.0.0.1:*",
            ),
        ];
        let youtube = [
            (
                "script-src",
                "'self' https://www.youtube.com https://s.ytimg.com",
            ),
            ("frame-src", "https://www.youtube.com"),
        ];
        let vimeo = [
            ("script-src", "'self' https://player.vimeo.com"),
            ("frame-src", "https://player.vimeo.com"),
        ];
        assert_eq!(
            served_policy("/youtube.html"),
            policy(&[&shared[..], &youtube[..]].concat())
        );
        assert_eq!(
            served_policy("/vimeo.html"),
            policy(&[&shared[..], &vimeo[..]].concat())
        );
        let resource = policy(&[("default-src", "'none'"), ("frame-ancestors", "'none'")]);
        assert_eq!(served_policy("/video-embed.js"), resource);
        assert_eq!(served_policy("/missing"), resource);
    }
}
