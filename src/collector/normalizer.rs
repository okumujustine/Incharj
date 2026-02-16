use regex::Regex;
use sha2::{Digest, Sha256};
use std::sync::LazyLock;

static RE_SINGLE_QUOTED: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"'(?:''|[^'])*'").unwrap());
static RE_NUMBER: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\b-?\d+(\.\d+)?\b").unwrap());
static RE_WS: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\s+").unwrap());

pub fn normalize_query(q: &str) -> String {
    let s = q.trim();
    let s = RE_SINGLE_QUOTED.replace_all(s, "?");
    let s = RE_NUMBER.replace_all(&s, "?");
    let s = RE_WS.replace_all(&s, " ");
    s.to_string()
}

pub fn fingerprint(normalized: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(normalized.as_bytes());
    hex::encode(hasher.finalize())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_normalize_query_removes_strings() {
        let query = "SELECT * FROM users WHERE name = 'John'";
        let normalized = normalize_query(query);
        assert_eq!(normalized, "SELECT * FROM users WHERE name = ?");
    }

    #[test]
    fn test_normalize_query_removes_numbers() {
        let query = "SELECT * FROM users WHERE id = 123";
        let normalized = normalize_query(query);
        assert_eq!(normalized, "SELECT * FROM users WHERE id = ?");
    }

    #[test]
    fn test_normalize_query_collapses_whitespace() {
        let query = "SELECT   *   FROM   users";
        let normalized = normalize_query(query);
        assert_eq!(normalized, "SELECT * FROM users");
    }

    #[test]
    fn test_fingerprint_is_consistent() {
        let query = "SELECT * FROM users";
        let fp1 = fingerprint(query);
        let fp2 = fingerprint(query);
        assert_eq!(fp1, fp2);
    }

    #[test]
    fn test_fingerprint_is_different_for_different_queries() {
        let fp1 = fingerprint("SELECT * FROM users");
        let fp2 = fingerprint("SELECT * FROM orders");
        assert_ne!(fp1, fp2);
    }
}
