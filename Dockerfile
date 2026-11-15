FROM python:3.12-alpine

ENV PYTHONUNBUFFERED=1 DATA_DIR=/data
WORKDIR /srv

COPY requirements.txt .
RUN apk upgrade --no-cache \
    && pip install --no-cache-dir -r requirements.txt \
    && addgroup -g 10001 -S app \
    && adduser -u 10001 -S -G app -H -s /sbin/nologin app \
    && mkdir -p /data && chown app:app /data

COPY app ./app

USER app
VOLUME /data
# 8080 is commonly taken on QNAP NAS (QTS web UI / Container Station), so use 8787.
EXPOSE 8787

# One worker on purpose: the background poller lives inside the process.
CMD ["gunicorn", "--workers", "1", "--threads", "8", "--bind", "0.0.0.0:8787", "app.server:app"]
