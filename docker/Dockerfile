# Use ARM64-native image for Apple Silicon (M1/M2/M3/M4)
FROM emscripten/emsdk:4.0.2-arm64

# Install build tools required for KiCad WASM build
RUN apt-get update && apt-get install -y \
    cmake \
    autoconf \
    automake \
    libtool \
    meson \
    ninja-build \
    pkg-config \
    curl \
    git \
    python3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace

# Entry point that sources Emscripten environment
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
CMD ["bash"]
