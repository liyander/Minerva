FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt update && apt install -y \
    sudo \
    nano \
    vim \
    curl \
    wget \
    git \
    iputils-ping \
    net-tools \
    iproute2 \
    && apt clean

CMD ["/bin/bash"]