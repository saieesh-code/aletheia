// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "AletheiaSDK",
    platforms: [
        .iOS(.v16),   // Secure Enclave P256 requires iOS 14+; App Attest requires iOS 14+
        .macOS(.v13),
    ],
    products: [
        .library(name: "AletheiaSDK", targets: ["AletheiaSDK"]),
    ],
    dependencies: [],
    targets: [
        .target(
            name: "AletheiaSDK",
            dependencies: [],
            path: "Sources/AletheiaSDK",
            swiftSettings: [
                .enableExperimentalFeature("StrictConcurrency"),
            ]
        ),
        .testTarget(
            name: "AletheiaSDKTests",
            dependencies: ["AletheiaSDK"],
            path: "Tests/AletheiaSDKTests"
        ),
    ]
)
