import Foundation

// MARK: - Shared enums

enum Modality: String, Codable, CaseIterable {
    case online
    case offline
}

enum AttendanceStatus: String, Codable {
    case attending
    case not_attending
}

// MARK: - /home

struct HomeResponse: Codable {
    let circle: CircleResponse?
    let nextSession: SessionResponse?
    let myAttendance: AttendanceResponse?
}

// MARK: - User

struct UserMeResponse: Codable {
    let id: String
    let user_name: String
    let first_name: String
    let last_name: String
    let city: String?
    let availability_day: String
    let availability_time: String
    let deviceToken: String?
}

struct UserUpdateRequest: Codable {
    var user_name: String?
    var first_name: String?
    var last_name: String?
    var city: String?
    var availability_day: String?
    var availability_time: String?
}

struct DeviceTokenRequest: Codable {
    let deviceToken: String
}

// MARK: - Circle

struct CircleResponse: Codable {
    let id: String
    let ritualType: String
    let modality: Modality
    let recurringTime: String
    let city: String?
    let countryCode: String?
    let cityName: String?
    let meetingPlace: String?
    let maxSize: Int
    let inviteCode: String
    let inviteOnly: Bool?
}

struct CircleCreateRequest: Codable {
    let ritualType: String
    let modality: Modality
    let recurringTime: String
    let city: String?
    let countryCode: String?
    let cityName: String?
    let meetingPlace: String?
    let inviteOnly: Bool?
}

struct CircleMemberResponse: Codable, Identifiable {
    let id: String
    let user_name: String
    let first_name: String
    let last_name: String
}

struct CircleMeResponse: Codable {
    let circle: CircleResponse?
    let members: [CircleMemberResponse]
}

struct JoinCircleResponse: Codable {
    let circle: CircleResponse
}

struct CircleLeaveRequest: Codable {
    let circleId: String
}

// MARK: - Session

struct SessionResponse: Codable {
    let id: String
    let circleId: String
    let dateTime: Date
    let locationOrLink: String
}

// MARK: - Attendance

struct AttendanceResponse: Codable {
    let userId: String
    let sessionId: String
    let status: AttendanceStatus
}

struct AttendanceUpsertRequest: Codable {
    let status: AttendanceStatus
}

