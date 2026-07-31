FROM apache/superset:5.0.0
USER root
# The image's own `superset` console script runs inside an isolated uv venv
# at /app/.venv, which system pip (/usr/local/bin/pip) does NOT install
# into — confirmed live: `pip install` succeeds but `superset db upgrade`
# still raises ModuleNotFoundError('authlib'). Install with uv directly
# against that venv's interpreter instead.
RUN uv pip install --python /app/.venv/bin/python Authlib==1.3.2
USER superset
