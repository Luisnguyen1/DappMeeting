# DApp Meeting - Tài liệu kỹ thuật

## 1. Tài liệu chi tiết

Để có thông tin chi tiết về từng thành phần, vui lòng tham khảo các tài liệu sau:

- [Tài liệu Frontend](./documents/frontend.md): Chi tiết về giao diện người dùng, tương tác WebRTC và kết nối với Smart Contract
- [Tài liệu Backend](./documents/Backend.md): Chi tiết về xử lý sự kiện, hàng đợi giao dịch và tương tác với Cloudflare
- [Tài liệu Smart Contract](./documents/SmartConstract.md): Chi tiết về cấu trúc hợp đồng thông minh, các hàm và sự kiện

## Mục lục
- [1. Tài liệu chi tiết](#1-tài-liệu-chi-tiết)
- [2. Tổng quan hệ thống](#2-tổng-quan-hệ-thống)
- [3. Cấu trúc dữ liệu](#3-cấu-trúc-dữ-liệu)
- [4. Luồng hoạt động](#4-luồng-hoạt-động)
- [5. Frontend](#5-frontend)
- [6. Smart Contract](#6-smart-contract)
- [7. Backend](#7-backend)
- [8. Tương tác với Cloudflare Calls](#8-tương-tác-với-cloudflare-calls)
- [9. Hướng dẫn chạy dự án](#9-hướng-dẫn-chạy-dự-án)
- [10. Sơ đồ chi tiết](#10-sơ-đồ-chi-tiết)
- [11. Bảng tổng hợp chức năng và API](#11-bảng-tổng-hợp-chức-năng-và-api)

## 2. Tổng quan hệ thống

DApp Meeting là ứng dụng họp trực tuyến phi tập trung kết hợp giữa công nghệ blockchain và WebRTC, cho phép người dùng tham gia các cuộc họp video thông qua các chức năng:
- Tạo phòng họp mới
- Tham gia phòng họp hiện có
- Chia sẻ video/âm thanh
- Tương tác với các người tham gia khác

### Kiến trúc hệ thống

```mermaid
flowchart TB
    Frontend["Frontend<br>HTML/CSS/JS"] <--> SmartContract["Smart Contract<br>Solidity"]
    SmartContract <--> Backend["Backend<br>Go"]
    
    Frontend --> WebRTCClient["WebRTC Client<br>JavaScript API"]
    Backend --> CloudflareCalls["Cloudflare Calls<br>API Integration"]
    
    style Frontend fill:#f9f,stroke:#333,stroke-width:2px
    style SmartContract fill:#bbf,stroke:#333,stroke-width:2px
    style Backend fill:#bfb,stroke:#333,stroke-width:2px
    style WebRTCClient fill:#fdb,stroke:#333,stroke-width:1px
    style CloudflareCalls fill:#ddf,stroke:#333,stroke-width:1px
```

### Các thành phần chính

1. **Frontend**: Giao diện người dùng HTML/CSS/JavaScript, xử lý tương tác và kết nối WebRTC
2. **Smart Contract**: Lưu trữ thông tin về phòng họp và người tham gia, xử lý sự kiện
3. **Backend**: Kết nối giữa smart contract và Cloudflare, xử lý logic sự kiện
4. **Cloudflare Calls**: Dịch vụ WebRTC để xử lý kết nối video/âm thanh

## 2. Cấu trúc dữ liệu

### Smart Contract

```mermaid
classDiagram
    class Track {
        +string trackName
        +string mid
        +string location
        +string sessionId
        +string roomId
        +bool isPublished
    }
    
    class Participant {
        +address walletAddress
        +string name
        +string sessionID
        +Track[] tracks
    }
    
    class Room {
        +string roomId
        +uint256 creationTime
        +Participant[] participants
    }
    
    Room "1" *-- "many" Participant : contains
    Participant "1" *-- "many" Track : has
```


## 3. Luồng hoạt động

### Tạo và tham gia phòng họp

```mermaid
sequenceDiagram
    participant FE as Frontend
    participant SC as Smart Contract
    participant BE as Backend
    participant CF as Cloudflare
    
    FE->>SC: createRoom(roomId)
    Note over FE,SC: Tạo phòng mới
    
    FE->>SC: joinRoom(roomId, name, tracks, offerSDP)
    Note over FE,SC: Tham gia phòng với SDP offer
    
    SC->>BE: ParticipantJoined Event
    Note over SC,BE: Sự kiện người dùng tham gia
    
    BE->>CF: createSession()
    BE->>CF: publishTracks(offerSDP)
    CF-->>BE: answerSDP
    
    BE->>SC: forwardEventToFrontend(sessionID, answerSDP)
    SC-->>FE: EventForwardedToFrontend
    
    FE->>FE: setRemoteDescription(answerSDP)
    Note over FE: Thiết lập kết nối WebRTC
```

### Publish và Pull Tracks

```mermaid
sequenceDiagram
    participant FE as Frontend
    participant SC as Smart Contract
    participant BE as Backend
    participant CF as Cloudflare
    
    FE->>SC: forwardEventToBackend(publish track data)
    SC->>BE: EventForwardedToBackend
    
    BE->>CF: publishTrack()
    CF-->>BE: response
    
    BE->>SC: forwardEventToFrontend(track response)
    SC-->>FE: EventForwardedToFrontend
    
    Note over FE: Xử lý phản hồi và cập nhật kết nối
```

### Rời phòng họp

```mermaid
sequenceDiagram
    participant FE as Frontend
    participant SC as Smart Contract
    participant BE as Backend
    
    FE->>SC: leaveRoom(roomId)
    SC->>BE: ParticipantLeft Event
    
    FE->>FE: closeWebRTCConnection()
    Note over FE: Đóng kết nối
    
    FE->>FE: redirectToHomePage()
    Note over FE: Chuyển về trang chủ
```

## 4. Frontend

### Cấu trúc thư mục

- **index.html**: Trang chính, tạo/tham gia phòng
- **join.html**: Tham gia phòng với ID
- **room.html**: Giao diện phòng họp
- **js/**
  - **CloudflareCalls.js**: Xử lý gọi Cloudflare
  - **smartContractIntegration.js**: Kết nối với smart contract
  - **contractEventListener.js**: Lắng nghe sự kiện từ smart contract
  - **auth.js**: Xác thực ví

### Quy trình hoạt động Frontend

1. **Kết nối ví blockchain**:
   - Người dùng nhập private key
   - Frontend khởi tạo kết nối với blockchain
   - Lưu private key trong localStorage

2. **Tạo/tham gia phòng**:
   - Tạo phòng: Gọi `createRoom()` trên smart contract, tạo UUID
   - Tham gia phòng: Gọi `joinRoom()` với roomId, name, tracks, sessionDescription

3. **Xử lý WebRTC**:
   - Tạo RTCPeerConnection và LocalStream
   - Lắng nghe sự kiện từ smart contract
   - Xử lý thông tin phiên (SDP offer/answer)

4. **Rời phòng**:
   - Gọi `leaveRoom()` trên smart contract
   - Đóng kết nối WebRTC
   - Chuyển hướng về trang chính

### Chi tiết tương tác với Smart Contract

Frontend tương tác với smart contract thông qua các hàm:

- `createRoom(roomId)`: Tạo phòng mới
- `joinRoom(roomId, name, tracks, sessionDescription)`: Tham gia phòng
- `forwardEventToBackend(roomId, eventData)`: Gửi sự kiện tới backend
- `leaveRoom(roomId)`: Rời phòng

Đồng thời lắng nghe các sự kiện:
- `EventForwardedToFrontend`: Nhận thông tin từ backend
- `TrackPullComplete`: Xác nhận hoàn thành pull track
- `ParticipantJoined`, `ParticipantLeft`: Cập nhật danh sách người tham gia

## 5. Smart Contract

### Chức năng chính

1. **Quản lý phòng họp**:
   - Tạo phòng, lưu trữ thông tin người tham gia
   - Track là đơn vị dữ liệu media (audio, video)

2. **Quản lý người tham gia**:
   - Lưu trữ thông tin người tham gia, bao gồm session ID từ Cloudflare
   - Quản lý danh sách track của mỗi người

3. **Trung gian giao tiếp**:
   - Chuyển tiếp sự kiện giữa frontend và backend
   - Phát các sự kiện quan trọng để các bên lắng nghe

### Các hàm và sự kiện quan trọng

**Hàm**:
- `createRoom(string memory _roomId)`
- `joinRoom(string memory _roomId, string memory _name, Track[] memory _initialTracks, bytes sessionDescription)`
- `leaveRoom(string memory _roomId)`
- `setParticipantSessionID(string memory _roomId, address _participantAddress, string memory _sessionID)`
- `addTrack(string memory _roomId, Track memory _newTrack)`
- `forwardEventToBackend(string memory _roomId, string memory _eventData)`
- `forwardEventToFrontend(string memory _roomId, address _participant, string memory _eventData)`

**Sự kiện**:
- `ParticipantJoined(string roomId, address participant, bytes trackData, Track[] memory _initialTracks, bytes sessionDescription)`
- `ParticipantLeft(string roomId, address participant)`
- `TrackAdded(string roomId, address participant, string trackName)`
- `EventForwardedToBackend(string roomId, address sender, string eventData)`
- `EventForwardedToFrontend(string roomId, address participant, string eventData)`

## 6. Backend

### Kiến trúc Backend

Backend được chia thành hai phần chính:

1. **Event Listener & Transaction Manager**:
   - Lắng nghe sự kiện từ smart contract
   - Quản lý danh sách ví để thực hiện giao dịch
   - Hàng đợi yêu cầu khi tất cả ví bận

2. **Cloudflare Interaction**:
   - Tương tác với API Cloudflare Calls
   - Tạo session, publish tracks, pull tracks
   - Truyền thông tin session về frontend qua smart contract

### Quy trình xử lý Backend

1. **Lắng nghe sự kiện từ smart contract**:
   ```go
   eventListener.ListenForEvents("ParticipantJoined", handleParticipantJoined)
   eventListener.ListenForEvents("EventForwardedToBackend", handleEventForwarded)
   ```

2. **Xử lý sự kiện tham gia phòng**:
   - Nhận thông tin participant và session description
   - Tạo session trên Cloudflare Calls
   - Publish tracks ban đầu
   - Gửi phản hồi về frontend với session ID và answer SDP

3. **Xử lý yêu cầu publish/pull track**:
   - Nhận yêu cầu từ frontend qua `EventForwardedToBackend`
   - Thực hiện thao tác trên Cloudflare Calls
   - Gửi phản hồi về frontend qua `forwardEventToFrontend`

4. **Quản lý ví và giao dịch**:
   - Mỗi ví chỉ xử lý một giao dịch tại một thời điểm
   - Sử dụng cơ chế hàng đợi khi tất cả ví bận

## 7. Tương tác với Cloudflare Calls

Backend sử dụng API Cloudflare Calls thông qua service:

### Các API chính

- `CreateSession()`: Tạo phiên mới, trả về session ID
- `PublishTracks()`: Đăng ký track mới với offer SDP
- `PullTracks()`: Kéo track từ người tham gia khác
- `GetSessionState()`: Lấy trạng thái phiên hiện tại

### Luồng xử lý WebRTC

1. **Publish track**:
   - Frontend tạo offer SDP và gửi tới Backend qua smart contract
   - Backend gọi PublishTracks() với offer này
   - Cloudflare trả về answer SDP
   - Answer được gửi về Frontend qua smart contract
   - Frontend thiết lập kết nối WebRTC với answer

2. **Pull track**:
   - Frontend yêu cầu pull track từ người tham gia khác
   - Backend gọi PullTracks() cho session
   - Cloudflare xử lý và thiết lập kết nối
   - Thông tin được chuyển về Frontend

## 8. Hướng dẫn chạy dự án

### Cài đặt và triển khai Smart Contract

1. **Cài đặt dependencies**:
   ```bash
   cd smartconstract
   npm install
   ```

2. **Biên dịch smart contract**:
   ```bash
   npx hardhat compile
   ```

3. **Triển khai smart contract (trên testnet hoặc local blockchain)**:
   ```bash
   npx hardhat run scripts/deploy.js --network <network-name>
   ```

### Chạy Backend

1. **Cài đặt Go dependencies**:
   ```bash
   cd Backend
   go mod tidy
   ```

2. **Cấu hình biến môi trường**:
   ```bash
   cp .env.example .env
   # Chỉnh sửa .env với thông tin Cloudflare và blockchain
   ```

3. **Chạy server**:
   ```bash
   go run main.go
   ```

### Chạy Frontend

1. **Cấu hình blockchain**:
   - Cập nhật địa chỉ smart contract trong smartContractIntegration.js

2. **Khởi chạy server HTTP đơn giản**:
   ```bash
   cd frontend
   python -m http.server 8080
   ```

3. **Truy cập ứng dụng**:
   - Mở trình duyệt và truy cập `http://localhost:8080`

## 9. Sơ đồ chi tiết

### Sơ đồ cấu trúc lớp

```mermaid
classDiagram
    class Frontend {
        +CloudflareCalls
        +smartContractIntegration
        +contractEventListener
        +auth
    }
    
    class SmartContract {
    }
    
    class Backend {
        +EventHandler
        +SMCallManager
        +CloudflareService
    }
    
    class EventHandler {
        +handleParticipantJoined()
        +handleParticipantLeft()
        +handleTrackAdded()
        +handleEventToBackend()
    }
    
    class SMCallManager {
        +ForwardEventToFrontend()
        +SetParticipantSessionID()
        +processQueue()
    }
    
    class CloudflareService {
        +CreateSession()
        +PublishTracks()
        +PullTracks()
        +Renegotiate()
        +GetSessionState()
    }
    
    Frontend --> SmartContract: calls
    SmartContract --> Frontend: events
    SmartContract --> Backend: events
    Backend --> SmartContract: calls
    Backend "1" *-- "1" EventHandler
    Backend "1" *-- "1" SMCallManager
    Backend "1" *-- "1" CloudflareService
```

### Sơ đồ tương tác giữa các thành phần

```mermaid
flowchart TD
    subgraph "Client Side"
        F[Frontend] --> W[WebRTC Client]
        F --> CM[Connection Manager]
    end

    subgraph "Blockchain"
        SC[Smart Contract]
    end

    subgraph "Server Side"
        B[Backend] --> EH[Event Handler]
        B --> CF[Cloudflare Service]
        B --> SM[SM Call Manager]
    end

    F <--> SC
    SC <--> B
    CF <--> Cloud[Cloudflare Calls]

    %% Chú thích đơn giản bằng các node bổ sung
    Note1["Gọi hàm/lắng nghe sự kiện"] --> F
    Note2["Phát sự kiện/gọi hàm"] --> B
    Note3["API Calls"] --> CF

```

### Sơ đồ trạng thái người tham gia

```mermaid
stateDiagram-v2
    [*] --> NotConnected
    NotConnected --> AuthenticatingWallet: "Nhập private key"
    AuthenticatingWallet --> ConnectingToRoom: "Kết nối thành công"
    ConnectingToRoom --> ConnectedToRoom: "Tham gia phòng"
    
    ConnectedToRoom --> PublishingTrack: "Thêm track"
    PublishingTrack --> ConnectedToRoom: "Track đã publish"
    
    ConnectedToRoom --> PullingTrack: "Pull track"
    PullingTrack --> ConnectedToRoom: "Track đã pull"
    
    ConnectedToRoom --> LeavingRoom: "Rời phòng"
    LeavingRoom --> NotConnected: "Đã rời phòng"
```


### Sơ đồ chi tiết WebRTC Negotiation

```mermaid
sequenceDiagram
    participant F as Frontend
    participant SC as Smart Contract
    participant B as Backend
    participant CF as Cloudflare
    
    F->>F: Tạo RTCPeerConnection
    F->>F: Thêm local tracks
    F->>F: createOffer()
    F->>F: setLocalDescription()
    
    F->>SC: joinRoom với offer
    SC->>B: ParticipantJoined
    
    B->>CF: CreateSession()
    B->>CF: PublishTracks(offer)
    CF-->>B: Answer SDP
    
    B->>SC: forwardEventToFrontend
    SC-->>F: EventForwardedToFrontend (Answer SDP)
    
    F->>F: setRemoteDescription()
    Note over F: Kết nối WebRTC thiết lập
```

## 10. Tài liệu chi tiết

Để có thông tin chi tiết về từng thành phần, vui lòng tham khảo các tài liệu sau:

- [Tài liệu Frontend](./documents/frontend.md): Chi tiết về giao diện người dùng, tương tác WebRTC và kết nối với Smart Contract
- [Tài liệu Backend](./documents/Backend.md): Chi tiết về xử lý sự kiện, hàng đợi giao dịch và tương tác với Cloudflare
- [Tài liệu Smart Contract](./documents/SmartConstract.md): Chi tiết về cấu trúc hợp đồng thông minh, các hàm và sự kiện

## 11. Bảng tổng hợp chức năng 

### Smart Contract

| Hàm                     | Mô tả                              | Gọi bởi     | Phát sự kiện                     |
|-------------------------|------------------------------------|-----------|------------------------------------|
| `createRoom`            | Tạo phòng mới                      | Frontend  | -                                  |
| `joinRoom`              | Tham gia phòng                     | Frontend  | `ParticipantJoined`, `TrackAdded`  |
| `leaveRoom`             | Rời khỏi phòng                     | Frontend  | `ParticipantLeft`                  |
| `setParticipantSessionID`| Cập nhật sessionID                 | Backend   | -                                  |
| `addTrack`              | Thêm track mới                     | Frontend  | `TrackAdded`                       |
| `forwardEventToBackend` | Gửi sự kiện tới backend            | Frontend  | `EventForwardedToBackend`          |
| `forwardEventToFrontend`| Gửi sự kiện tới frontend           | Backend   | `EventForwardedToFrontend`         |

### Frontend (CloudflareCalls.js)

| Phương thức        | Mô tả                                   | Tương tác với |
|-------------------|----------------------------------------|--------------|
| `createRoom`       | Tạo phòng mới                           | Smart Contract |
| `joinRoom`         | Tham gia phòng                          | Smart Contract |
| `leaveRoom`        | Rời khỏi phòng                          | Smart Contract |
| `publishTrack`     | Đăng ký track mới                       | Smart Contract |
| `pullTrack`        | Kéo track từ người khác                 | Smart Contract |
| `getParticipantsFromContract` | Lấy danh sách người tham gia | Smart Contract |

### Backend (CloudflareService)

| Phương thức        | Mô tả                                   | Tương tác với |
|-------------------|----------------------------------------|--------------|
| `CreateSession`    | Tạo phiên mới                           | Cloudflare API |
| `PublishTracks`    | Đăng ký tracks                          | Cloudflare API |
| `PullTracks`       | Kéo tracks từ session khác              | Cloudflare API |
| `Renegotiate`      | Thương lượng lại kết nối                | Cloudflare API |
| `CloseTracks`      | Đóng tracks                             | Cloudflare API |
| `GetSessionState`  | Lấy trạng thái phiên                    | Cloudflare API |

### Contribute
Nguyễn Văn Mạnh

🌐 Website: https://vanmanh-dev.id.vn/

📧 Email: luisaccforwork@gmail.com

📞 Điện thoại: +84 397 161 120

💼 Kết nối với tôi: GitHub | Facebook | Hugging Face