$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
$cache = Join-Path $env:USERPROFILE '.gradle/caches/modules-2/files-2.1'
$modules = @(
    'org.jetbrains.kotlin/kotlin-compiler-embeddable/2.3.10',
    'org.jetbrains.kotlin/kotlin-stdlib/2.3.10',
    'org.jetbrains.kotlin/kotlin-script-runtime/2.3.10',
    'org.jetbrains.kotlin/kotlin-reflect/1.6.10',
    'org.jetbrains.kotlin/kotlin-daemon-embeddable/2.3.10',
    'org.jetbrains.kotlinx/kotlinx-coroutines-core-jvm/1.8.0',
    'org.jetbrains/annotations/13.0'
)
$jars = foreach ($module in $modules) {
    Get-ChildItem -LiteralPath (Join-Path $cache $module) -Recurse -Filter '*.jar' | Select-Object -ExpandProperty FullName
}
$classpath = $jars -join [IO.Path]::PathSeparator
$testOutput = Join-Path $repo 'android/app/build/liquid-tabs-check'
New-Item -ItemType Directory -Path $testOutput -Force | Out-Null
& java -cp $classpath org.jetbrains.kotlin.cli.jvm.K2JVMCompiler -no-stdlib -no-reflect -classpath $classpath -jvm-target 17 -d $testOutput (Join-Path $repo 'android/app/src/main/java/com/lxnx/music/glass/LiquidTabSpring.kt') (Join-Path $PSScriptRoot 'LiquidTabSpringCheck.kt')
if ($LASTEXITCODE -ne 0) { throw 'Spring check compilation failed' }
& java -cp "$testOutput$([IO.Path]::PathSeparator)$classpath" com.lxnx.music.glass.LiquidTabSpringCheckKt
if ($LASTEXITCODE -ne 0) { throw 'Spring checks failed' }
