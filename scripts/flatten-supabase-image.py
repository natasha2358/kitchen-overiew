#!/usr/bin/env python3
"""Local Docker vfs workaround. Requires trusted crane on PATH; never pushes images."""
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile

source = 'registry-1.docker.io/supabase/postgres:17.6.1.075'
target = 'supabase/postgres:17.6.1.075'
crane = os.environ.get('CRANE_BIN', 'crane')

def output(args):
    return subprocess.check_output(args, text=True).strip()

digest = output([crane, 'digest', source])
if not re.fullmatch(r'sha256:[0-9a-f]{64}', digest):
    raise RuntimeError('Invalid registry digest')
resolved = source.split(':')[0] + '@' + digest
configuration = json.loads(output([crane, 'config', resolved]))['config']
with tempfile.TemporaryDirectory(prefix='smart-kitchen-image-') as temporary:
    archive = str(Path(temporary) / 'rootfs.tar')
    # crane resolves OCI whiteouts and validates registry content digests while exporting.
    subprocess.run([crane, 'export', resolved, archive], check=True)
    args = ['docker', 'import']
    for item in configuration.get('Env', []):
        name, value = item.split('=', 1)
        args += ['--change', 'ENV ' + name + '=' + json.dumps(value)]
    for field, instruction in [('Entrypoint', 'ENTRYPOINT'), ('Cmd', 'CMD'), ('Volumes', 'VOLUME')]:
        value = configuration.get(field)
        if value:
            args += ['--change', instruction + ' ' + json.dumps(list(value) if field == 'Volumes' else value)]
    for field, instruction in [('WorkingDir', 'WORKDIR'), ('User', 'USER'), ('StopSignal', 'STOPSIGNAL')]:
        if configuration.get(field):
            args += ['--change', instruction + ' ' + configuration[field]]
    for port in configuration.get('ExposedPorts', {}):
        args += ['--change', 'EXPOSE ' + port]
    args += ['--change', 'LABEL org.smartkitchen.source-digest=' + digest, archive, target]
    subprocess.run(args, check=True)
print('Imported a local flattened image from verified source', digest)
