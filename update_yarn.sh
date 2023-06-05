#!/usr/bin/env bash

echo "[+] Updating the global Yarn version"
corepack prepare yarn@stable --activate
echo "[+] Updating Yarn berry if one exists..."
echo "[?] Details: https://github.com/yarnpkg/berry/blob/master/CHANGELOG.md"
yarn set version stable
echo "[+] Updating yarn plugins..."
YARN_PLUGINS=$(cat ./.yarnrc.yml| grep spec | cut -d ':' -f 2 | cut -d ' ' -f 2 | cut -d '"' -f 2)
for YARN_PLUGIN in ${YARN_PLUGINS}
do
  echo "[+] Updating plugin ${YARN_PLUGIN}..."
  yarn plugin import ${YARN_PLUGIN}
done
