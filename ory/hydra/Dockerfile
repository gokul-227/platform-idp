# Config baked onto the upstream image, so a config change is a new image with a
# git sha. Everything per-environment is an env var, whose value wins over the
# file, which is why there is one copy and no rendering step.
FROM oryd/hydra:v26.2.0

COPY . /etc/config/hydra

ENTRYPOINT ["hydra"]
CMD ["serve","all","--config","/etc/config/hydra/hydra.yml"]
