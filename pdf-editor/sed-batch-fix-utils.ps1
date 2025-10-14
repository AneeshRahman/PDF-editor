# Batch fix all @/components/ui/* imports to use relative paths
Get-ChildItem -Path "src" -Recurse -Include "*.tsx","*.ts" | ForEach-Object {
    $content = Get-Content $_.FullName -Raw

    # Fix UI imports
    if ($content -match 'from "@/components/ui/') {
        $dirDepth = ($_.DirectoryName.Split([IO.Path]::DirectorySeparatorChar) | Measure-Object).Count - 1
        if ($dirDepth -ge 2) {
            # ../../components/ui/
            $content = $content -replace 'from "@/components/ui/', "from '../../components/ui/"
        } elseif ($dirDepth -eq 1) {
            # ../components/ui/
            $content = $content -replace 'from "@/components/ui/', "from '../components/ui/"
        }
        Set-Content $_.FullName -Value $content -NoNewline
        Write-Host "Fixed UI import: $($_.FullName)"
    }

    # Fix hooks imports
    if ($content -match 'from "@/hooks/') {
        $dirDepth = ($_.DirectoryName.Split([IO.Path]::DirectorySeparatorChar) | Measure-Object).Count - 1
        if ($dirDepth -ge 2) {
            $content = $content -replace 'from "@/hooks/', "from '../../hooks/"
        } elseif ($dirDepth -eq 1) {
            $content = $content -replace 'from "@/hooks/', "from '../hooks/"
        }
        Set-Content $_.FullName -Value $content -NoNewline
        Write-Host "Fixed hooks import: $($_.FullName)"
    }

    # Fix lib imports
    if ($content -match 'from "@/lib/') {
        $dirDepth = ($_.DirectoryName.Split([IO.Path]::DirectorySeparatorChar) | Measure-Object).Count - 1
        if ($dirDepth -ge 2) {
            $content = $content -replace 'from "@/lib/', "from '../../lib/"
        } elseif ($dirDepth -eq 1) {
            $content = $content -replace 'from "@/lib/', "from '../lib/"
        }
        Set-Content $_.FullName -Value $content -NoNewline
        Write-Host "Fixed lib import: $($_.FullName)"
    }

    # Fix components imports in ui directory
    if ($content -match 'from "@/components/') {
        $dirDepth = ($_.DirectoryName.Split([IO.Path]::DirectorySeparatorChar) | Measure-Object).Count - 1
        if ($dirDepth -ge 2) {
            $content = $content -replace 'from "@/components/', "from '../../components/"
        } elseif ($dirDepth -eq 1) {
            $content = $content -replace 'from "@/components/', "from '../components/"
        }
        Set-Content $_.FullName -Value $content -NoNewline
        Write-Host "Fixed components import: $($_.FullName)"
    }
}
