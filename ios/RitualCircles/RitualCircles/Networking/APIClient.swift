import Foundation

final class APIClient {
    static let shared = APIClient()

    private let session: URLSession
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    init(session: URLSession = .shared) {
        self.session = session
        decoder.dateDecodingStrategy = .iso8601
    }

    // MARK: - Core contract

    func getHome() async throws -> HomeResponse {
        try await request(method: "GET", path: "/home", body: Optional<String>.none)
    }

    // MARK: - User

    func getMe() async throws -> UserMeResponse {
        try await request(method: "GET", path: "/me", body: Optional<String>.none)
    }

    func patchMe(_ payload: UserUpdateRequest) async throws -> UserMeResponse {
        try await request(method: "PATCH", path: "/me", body: payload)
    }

    func postDeviceToken(_ payload: DeviceTokenRequest) async throws {
        _ = try await request(method: "POST", path: "/me/device-token", body: payload) as EmptyResponse
    }

    // MARK: - Circles

    func createCircle(_ payload: CircleCreateRequest) async throws -> CircleResponse {
        try await request(method: "POST", path: "/circles", body: payload)
    }

    func joinCircle(inviteCode: String) async throws -> JoinCircleResponse {
        try await request(method: "POST", path: "/circles/join/\(inviteCode)", body: Optional<String>.none)
    }

    func leaveCircle(circleId: String) async throws {
        let body = CircleLeaveRequest(circleId: circleId)
        _ = try await request(method: "POST", path: "/circles/leave", body: body) as EmptyResponse
    }

    func getMyCircle(circleId: String? = nil) async throws -> CircleMeResponse {
        let path: String
        if let circleId, !circleId.isEmpty,
           let enc = circleId.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) {
            path = "/circles/me?circleId=\(enc)"
        } else {
            path = "/circles/me"
        }
        return try await request(method: "GET", path: path, body: Optional<String>.none)
    }

    // MARK: - Sessions

    func getNextSession() async throws -> SessionResponse? {
        try await request(method: "GET", path: "/sessions/next", body: Optional<String>.none)
    }

    // MARK: - Attendance

    func putAttendance(sessionId: String, status: AttendanceStatus) async throws -> AttendanceResponse {
        let body = AttendanceUpsertRequest(status: status)
        return try await request(method: "PUT", path: "/sessions/\(sessionId)/attendance", body: body)
    }

    // MARK: - Request helper

    /// `path` is like `/home` or `/circles/me?circleId=…` (resolved against `APIConfig.baseURL`).
    private func resolvedURL(for path: String) -> URL {
        let relative = path.hasPrefix("/") ? String(path.dropFirst()) : path
        guard let url = URL(string: relative, relativeTo: APIConfig.baseURL)?.absoluteURL else {
            fatalError("Invalid API path: \(path)")
        }
        return url
    }

    private func request<T: Decodable, B: Encodable>(method: String, path: String, body: B?) async throws -> T {
        var req = URLRequest(url: resolvedURL(for: path))
        req.httpMethod = method
        req.setValue("application/json", forHTTPHeaderField: "Accept")

        let userId = DevUserId.getOrCreate()
        req.setValue(userId.uuidString, forHTTPHeaderField: "X-User-Id")

        if let body {
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try encoder.encode(body)
        }

        let (data, response) = try await session.data(for: req)
        guard let http = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }
        guard (200..<300).contains(http.statusCode) else {
            let msg = String(data: data, encoding: .utf8) ?? ""
            throw APIError.http(status: http.statusCode, message: msg)
        }
        if T.self == EmptyResponse.self {
            return EmptyResponse() as! T
        }
        if data.isEmpty {
            throw APIError.emptyBody
        }
        return try decoder.decode(T.self, from: data)
    }
}

struct EmptyResponse: Decodable {
    init() {}
}

enum APIError: Error, LocalizedError {
    case invalidResponse
    case emptyBody
    case http(status: Int, message: String)

    var errorDescription: String? {
        switch self {
        case .invalidResponse:
            return "Invalid response"
        case .emptyBody:
            return "Empty response body"
        case .http(let status, let message):
            return "HTTP \(status): \(message)"
        }
    }
}

