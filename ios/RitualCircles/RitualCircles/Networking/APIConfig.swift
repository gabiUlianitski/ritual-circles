import Foundation

enum APIConfig {
    /// Update this to your FastAPI base URL.
    /// Examples:
    /// - http://localhost:8000  (simulator if backend runs on same machine)
    /// - http://192.168.1.10:8000 (device on LAN)
    // Use 8001 by default to avoid conflicts with other local services.
    static let baseURL = URL(string: "http://localhost:8001")!
}

