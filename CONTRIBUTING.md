Contributing to Aletheia

First of all, thank you for your interest in contributing to Aletheia – Reality Trust Infrastructure.

Aletheia aims to become a trusted provenance and verification layer for digital media in the age of AI-generated content and deepfakes. We welcome contributions from developers, researchers, security engineers, designers, and technical writers.

⸻

Code of Conduct

By participating in this project, you agree to:

* Be respectful and constructive.
* Welcome new contributors.
* Provide helpful feedback.
* Avoid harassment, discrimination, or abusive behavior.
* Focus discussions on improving the project.

⸻

Ways to Contribute

You can contribute in many ways:

* Fix bugs
* Implement new features
* Improve documentation
* Write tests
* Improve UI/UX
* Add new forensic algorithms
* Improve performance
* Create SDK integrations
* Report security vulnerabilities

⸻

Development Setup

Clone the Repository

git clone https://github.com/saieesh-code/aletheia.git
cd aletheia

⸻

Frontend Setup

cd aletheia-fixed
npm install
npm run dev

The frontend will be available at:

http://localhost:5173

⸻

Backend Setup

cd aletheia-backend
cp .env.example .env
cargo sqlx migrate run
cargo run

The backend will be available at:

http://localhost:8080

⸻

Development Workflow

1. Fork the Repository

Fork the repository to your own GitHub account.

⸻

2. Create a Branch

git checkout -b feature/my-feature

Examples:

git checkout -b feature/add-certificate-export
git checkout -b fix/signature-validation
git checkout -b docs/update-readme

⸻

3. Make Your Changes

* Keep commits small and focused.
* Add tests where possible.
* Update documentation if needed.

⸻

4. Run Checks

Frontend

npm run build
npm run lint

Backend

cargo build
cargo test
cargo fmt
cargo clippy

⸻

5. Commit Your Changes

Please follow these commit conventions:

feat: add new feature
fix: fix a bug
docs: update documentation
refactor: improve code structure
test: add tests
chore: maintenance work
perf: performance improvements

Examples:

git commit -m "feat: add provenance certificate download"
git commit -m "fix: resolve signature validation bug"
git commit -m "docs: update deployment instructions"

⸻

6. Push Your Branch

git push origin feature/my-feature

⸻

7. Open a Pull Request

Please include:

* Description of the change
* Screenshots (if UI changes)
* Related issue number
* Testing instructions

⸻

Pull Request Guidelines

Before submitting a PR, ensure:

* Code builds successfully
* Tests pass
* Documentation is updated
* No sensitive information is committed
* Commit history is clean

⸻

Reporting Bugs

Please open a GitHub Issue and include:

* Operating System
* Browser version
* Steps to reproduce
* Expected behavior
* Actual behavior
* Screenshots or logs

⸻

Feature Requests

Feature requests are welcome.

Please explain:

* The problem you are trying to solve
* Why it is useful
* A possible implementation approach

⸻

Security Vulnerabilities

Please do not disclose security vulnerabilities publicly.

Instead:

1. Open a private security advisory on GitHub.
2. Provide reproduction steps.
3. Include impact assessment.

⸻

Areas Needing Contribution

We are particularly looking for contributions in:

Cryptography & Security

* Hardware attestation improvements
* TPM 2.0 support
* WebAuthn integration
* Anti-replay mechanisms

Media Forensics

* Deepfake detection research
* Synthetic media analysis
* Metadata analysis algorithms
* Risk scoring improvements

Blockchain

* Polygon anchoring implementation
* Additional blockchain integrations
* Merkle proof verification

Mobile SDKs

* iOS Secure Enclave testing
* Android StrongBox testing
* Device attestation integrations

Frontend

* Accessibility improvements
* UI/UX enhancements
* Internationalization support

Documentation

* Documentation translations
* Tutorials
* Architecture diagrams
* API examples

Performance

* Benchmarking
* Database optimization
* Signature verification throughput
* Large file handling

⸻

Recognition

All contributors will be recognized in the project history and release notes.

Thank you for helping build trustworthy digital reality infrastructure.

⸻

<p align="center">
  <strong>In a world where anything can be generated, trust must be verifiable.</strong>
</p>
<p align="center">
  — The Aletheia Team
</p>