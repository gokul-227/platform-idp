# Config baked onto the upstream image, so a config change is a new image with a
# git sha. Everything per-environment is an env var, whose value wins over the
# file, which is why there is one copy and no rendering step.
FROM oryd/kratos:v26.2.0

COPY . /etc/config/kratos

ENTRYPOINT ["kratos"]
# --watch-courier runs the dispatcher in this process; without it Kratos queues
# into courier_messages, logs "Sending out ... email" and nothing leaves. Local
# default only: it is single-instance, so deployed environments run one
# kratos-courier and every other service drops the flag.
CMD ["serve","--config","/etc/config/kratos/kratos.yml","--watch-courier"]
