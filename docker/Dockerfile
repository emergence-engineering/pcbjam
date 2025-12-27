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
    python3-dev \
    protobuf-compiler \
    swig \
    unixodbc-dev \
    ccache \
    rsync \
    && rm -rf /var/lib/apt/lists/*

# Configure ccache for Emscripten
# CCACHE_DIR in named volume persists across containers
ENV CCACHE_DIR=/workspace/build-wasm/.ccache
ENV CCACHE_MAXSIZE=10G
ENV CCACHE_COMPILERCHECK=content
ENV CCACHE_SLOPPINESS=include_file_mtime,time_macros,pch_defines
ENV CCACHE_BASEDIR=/workspace

WORKDIR /workspace

# Entry point that sources Emscripten environment
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
CMD ["bash"]
