FROM rust:1.98-bookworm AS build
WORKDIR /workspace
COPY Cargo.toml Cargo.lock ./
COPY services/engine ./services/engine
COPY backend/protocol ./backend/protocol
COPY fixtures/recorded ./fixtures/recorded
RUN cargo build --release --locked -p sentinel-engine
FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=build /workspace/target/release/sentinel-engine /usr/local/bin/sentinel-engine
USER 10001
ENTRYPOINT ["sentinel-engine"]
