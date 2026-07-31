from __future__ import annotations

import argparse
import asyncio
import sys

from app_registry.config import get_settings
from app_registry.hydra_client import HydraAdminClient
from app_registry.logging_config import configure_logging
from app_registry.sync import HydraRegistrySync


def _print_help() -> None:
    print("Usage: app-registry-cli <command> [--dry-run]")
    print()
    print("Commands:")
    print("  sync   Synchronize integrations/applications YAML definitions to Hydra")
    print("  list   List OAuth2 clients registered in Hydra")
    print("  scan   List YAML definitions discovered on disk")


async def _run_sync(sync_engine: HydraRegistrySync, dry_run: bool) -> int:
    summary = await sync_engine.sync(dry_run)
    for result in summary.results:
        prefix = "✗" if result.action == "failed" else "✓"
        suffix = f" — {result.message}" if result.message else ""
        print(f"{prefix} {result.client_id}: {result.action}{suffix}")

    failures = sum(1 for result in summary.results if result.action == "failed")
    return 1 if failures > 0 else 0


async def _run_list(sync_engine: HydraRegistrySync) -> int:
    clients = await sync_engine.list_hydra_clients()
    print(f"Registered OAuth2/OIDC clients in Hydra ({len(clients)}):")
    for client in clients:
        grants = ", ".join(client.grant_types) if client.grant_types else "n/a"
        print(f"- {client.client_id} [{client.client_name or 'N/A'}] grants={grants}")
    return 0


async def _run_scan(sync_engine: HydraRegistrySync) -> int:
    registry = sync_engine.describe_registry()
    print(f"Registry path: {registry.registry_path}")
    print(f"Discovered {registry.count} application definition(s):")
    for filename in registry.files:
        print(f"- {filename}")
    return 0


async def _main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument("command", nargs="?", default="sync")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args(argv)

    settings = get_settings()
    logger = configure_logging("app-registry-cli", settings.log_level)
    hydra = HydraAdminClient(settings.hydra_admin_url)
    sync_engine = HydraRegistrySync(settings, hydra, logger)

    try:
        if args.command == "sync":
            return await _run_sync(sync_engine, args.dry_run)
        if args.command == "list":
            return await _run_list(sync_engine)
        if args.command == "scan":
            return await _run_scan(sync_engine)
        _print_help()
        return 1
    except Exception as error:  # noqa: BLE001 - top-level CLI error boundary
        logger.error("CLI command failed", command=args.command, error=str(error))
        return 1
    finally:
        await hydra.aclose()


def main() -> None:
    sys.exit(asyncio.run(_main(sys.argv[1:])))


if __name__ == "__main__":
    main()
