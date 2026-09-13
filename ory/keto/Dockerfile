# Config baked onto the upstream image, so a config change is a new image with a
# git sha. Everything per-environment is an env var, whose value wins over the
# file, which is why there is one copy and no rendering step.
FROM oryd/keto:v26.2.0

COPY . /etc/config/keto

ENTRYPOINT ["keto"]
CMD ["serve","--config","/etc/config/keto/keto.yml"]
