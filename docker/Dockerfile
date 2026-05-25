# Plain Ubuntu base — multi-arch (ARM64/x86_64 auto-detected)
FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

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
    xz-utils \
    && rm -rf /var/lib/apt/lists/*

# Install emsdk from source (same approach as scripts/setup-emsdk.sh)
# EMSCRIPTEN_VERSION must match scripts/common/versions.sh
ARG EMSCRIPTEN_VERSION=4.0.2
RUN git clone https://github.com/emscripten-core/emsdk.git /emsdk \
    && cd /emsdk \
    && ./emsdk install ${EMSCRIPTEN_VERSION} \
    && ./emsdk activate ${EMSCRIPTEN_VERSION}

# Make Docker's own emsdk authoritative for EVERY process in the container, including
# `docker compose exec` (which bypasses the ENTRYPOINT). env.sh keys off $EMSDK: with it
# set, env.sh sources /emsdk/emsdk_env.sh and never falls back to the local tools/emsdk
# (which, inside this Linux container, can be a host macOS emsdk rsync'd in by mistake and
# thus unrunnable). This is what lets the wxWidgets autoconf build find emmake on PATH.
ENV EMSDK=/emsdk

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
