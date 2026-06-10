import Foundation

enum DevUserId {
    private static let key = "dev_user_id"

    static func getOrCreate() -> UUID {
        if let s = UserDefaults.standard.string(forKey: key),
           let id = UUID(uuidString: s) {
            return id
        }
        let id = UUID()
        UserDefaults.standard.set(id.uuidString, forKey: key)
        return id
    }
}

