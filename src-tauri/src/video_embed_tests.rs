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
