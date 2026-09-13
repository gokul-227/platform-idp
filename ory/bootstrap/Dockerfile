# curl, jq and a shell. jq rather than sed: an identity response carries several
# "id" fields, so a regex picks the wrong one. Not the console image, because a
# smaller image holding admin reach is a smaller thing to reason about.
FROM alpine:3.21

RUN apk add --no-cache curl jq

COPY bootstrap-staff.sh /usr/local/bin/bootstrap-staff
RUN chmod +x /usr/local/bin/bootstrap-staff

ENTRYPOINT ["/usr/local/bin/bootstrap-staff"]
