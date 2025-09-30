# Dockerfile
FROM node:22-bullseye

WORKDIR /usr/src/mediasoup

RUN apt-get update && \
    apt-get install -y \
    python3 \
    python3-pip \
    git \
    pkg-config \
    build-essential \
    libstdc++6 \
    cmake \
    libssl-dev \
    ninja-build \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./

ENV MEDIASOUP_SKIP_WORKER_PREBUILT_DOWNLOAD="true" 
ENV MESON_ARGS="-Dms_disable_liburing=true"

RUN npm install --omit=dev
COPY . .

EXPOSE 40000-40100/udp

CMD ["node", "mediasoup-worker.js"]