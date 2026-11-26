#!/bin/bash
# Checks an installed swizdash from the server itself, as root: services, every
# protection, and the main API answers. Prints one line per check, exits 1 on a failure.
# The master's password is read on the server and never printed nor put in arguments.
set -uo pipefail

[[ $EUID -eq 0 ]] || {
    echo "Run it as root: sudo bash smoke.sh"
    exit 2
}

fails=0
# result <label> <command...>: PASS when the command succeeds
result() {
    local label=$1
    shift
    if "$@" > /dev/null 2>&1; then
        echo "PASS  ${label}"
    else
        echo "FAIL  ${label}"
        fails=$((fails + 1))
    fi
}

master=$(cut -d: -f1 /root/.master.info)
port=$(grep -oP 'listen \K[0-9]+' /etc/nginx/sites-enabled/swizdash 2> /dev/null | head -1)
url="https://127.0.0.1:${port}"

# curl as the master, credentials through stdin
as_master() { printf 'user = "%s:%s"\n' "$master" "$(cut -d: -f2 /root/.master.info)" | curl -sk -K - "$@"; }
status_is() {
    local want=$1
    shift
    [[ $("$@" -o /dev/null -w '%{http_code}') == "$want" ]]
}
api_ok() {
    local body
    body=$(as_master "${url}/api/$1")
    jq -e 'type != "object" or (has("error") | not)' <<< "$body"
}

result "swizdash.socket is active" systemctl is-active -q swizdash.socket
result "swizdash.service is active" systemctl is-active -q swizdash
result "the service is not in the www-data group" bash -c '! id -nG swizdash | grep -qw www-data'
result "the socket: group www-data, mode 660" test "$(stat -c '%G %a' /run/swizdash/http.sock)" == "www-data 660"
result "the token: root and swizdash only" test "$(stat -c '%U %G %a' /etc/swizdash/token)" == "root swizdash 640"
result "the nginx token file: root only" test "$(stat -c '%U %a' /etc/nginx/swizdash-token.conf)" == "root 600"
result "the code belongs to root" test -z "$(find /opt/swizdash ! -user root -print -quit)"
result "kernel.yama.ptrace_scope is 1 or more" test "$(sysctl -n kernel.yama.ptrace_scope)" -ge 1
result "nginx config is valid" nginx -t

result "no login: 401" status_is 401 curl -sk "${url}/api/meta"
result "socket without the token: 403" status_is 403 curl -s --unix-socket /run/swizdash/http.sock http://x/api/meta
result "the master logs in" status_is 200 as_master "${url}/api/meta"
result "the page has a Content-Security-Policy" bash -c "$(declare -f as_master); master=$master; as_master -D - -o /dev/null ${url}/ | grep -qi '^content-security-policy:'"
result "a cross-site request is refused" status_is 403 as_master -X POST -H 'Content-Type: application/json' -H 'Origin: https://evil.example' -d '{}' "${url}/api/history/clear"
result "a form post is refused" status_is 403 as_master -X POST -d 'a=b' "${url}/api/history/clear"

for path in summary live apps bandwidth updates system/hardware downloads jobs; do
    result "/api/${path} answers" api_ok "$path"
done
result "swizdash lists itself as running" bash -c "$(declare -f as_master); master=$master; as_master ${url}/api/apps | jq -e '.apps[] | select(.id == \"swizdash\") | .installed and .status == \"running\"'"

result "the helper refuses a unit outside the catalog" bash -c '! sudo -u swizdash sudo -n /usr/local/sbin/swizdash-helper service stop ssh'
result "the helper refuses to stop nginx" bash -c '! sudo -u swizdash sudo -n /usr/local/sbin/swizdash-helper service stop nginx'
result "swizdash cannot run anything else as root" bash -c '! sudo -u swizdash sudo -n /bin/true'

echo
if [[ $fails -eq 0 ]]; then
    echo "All checks passed"
else
    echo "${fails} check(s) failed"
    exit 1
fi
