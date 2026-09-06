#!/usr/bin/env python3
"""Apply the reviewed Chain patch to an unchanged source or icon-patch base."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import sys
import tempfile
from datetime import datetime, timezone


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest() if path.is_file() else None


def main():
    parser = argparse.ArgumentParser(description='Comprueba o aplica el parche de Chain sin sobrescribir cambios desconocidos.')
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--check', action='store_true', help='Solo comprobar; no modifica el proyecto.')
    mode.add_argument('--apply', action='store_true', help='Aplicar después de comprobar todos los archivos.')
    parser.add_argument('--project', type=Path, default=Path.cwd(), help='Raíz Replit que contiene artifacts/chain (por defecto, carpeta actual).')
    args = parser.parse_args()
    package = Path(__file__).resolve().parent
    project = args.project.resolve()
    if not (project / 'artifacts/chain/package.json').is_file():
        sys.exit('No se encuentra artifacts/chain/package.json. Ejecuta desde la raíz Replit o usa --project RUTA.')
    manifest = json.loads((package / 'manifest.json').read_text())
    pending, conflicts = [], []
    for item in manifest['files']:
        relative = Path(item['path'])
        if relative.is_absolute() or '..' in relative.parts:
            sys.exit('Ruta no válida en el paquete. No se ha modificado el proyecto.')
        target = project / relative
        source = package / 'reemplazar' / relative
        if not source.is_file() or digest(source) != item['final_sha256']:
            sys.exit(f'Archivo del paquete alterado o ausente: {relative}. Vuelve a extraer el ZIP.')
        # Do not follow a project symlink out of the requested checkout.
        if target.resolve() != target or any(p.is_symlink() for p in target.parents if p != project.parent):
            conflicts.append(f'{relative}: contiene un enlace simbólico')
            continue
        current = digest(target)
        if target.exists() and not target.is_file():
            conflicts.append(f'{relative}: no es un archivo normal')
        elif current == item['final_sha256']:
            continue
        elif current in item['accepted_sha256']:
            pending.append((relative, source, target, current))
        else:
            conflicts.append(f'{relative}: tiene cambios distintos a las versiones revisadas')
    if conflicts:
        print('No se ha aplicado ningún cambio. Revisa estos archivos y usa el diff para conservar tu trabajo:')
        print('\n'.join('  ' + message for message in conflicts))
        return 1
    if not pending:
        print('El parche ya está aplicado: los archivos coinciden.')
        return 0
    print(f'Comprobación correcta. {len(pending)} archivos pendientes; los demás ya coinciden.')
    if args.check:
        print('Puedes ejecutar el mismo comando con --apply para aplicarlos.')
        return 0
    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    backup = project / f'chain-code-backup-{stamp}'
    backup.mkdir(exist_ok=False)
    changed = []
    absent = []
    try:
        for relative, source, target, before in pending:
            # Refuse a concurrent edit even after the initial complete check.
            if digest(target) != before:
                raise RuntimeError(f'{relative} cambió durante la aplicación')
            saved = backup / relative
            if before is not None:
                saved.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(target, saved)
            else:
                absent.append(str(relative))
            target.parent.mkdir(parents=True, exist_ok=True)
            handle, temporary = tempfile.mkstemp(prefix='.chain-patch-', dir=target.parent)
            try:
                with os.fdopen(handle, 'wb') as stream:
                    stream.write(source.read_bytes())
                os.chmod(temporary, target.stat().st_mode & 0o777 if target.exists() else 0o644)
                os.replace(temporary, target)
            finally:
                if os.path.exists(temporary):
                    os.unlink(temporary)
            changed.append((relative, target, before))
        (backup / 'new-files.json').write_text(json.dumps(absent, indent=2) + '\n')
    except Exception as error:
        for relative, target, before in reversed(changed):
            if before is None:
                target.unlink(missing_ok=True)
            else:
                shutil.copy2(backup / relative, target)
        print(f'No se pudo aplicar: {error}. Se restauraron los archivos modificados.')
        return 1
    print(f'Parche aplicado. Copia del código anterior: {backup.name}')
    print('La copia guarda código, no datos de Expo. Sigue las pruebas y la nota sobre Plan del README antes de usarlo a diario.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
