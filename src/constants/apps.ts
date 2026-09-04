/*
 * Copyright ©2025-2026 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

/**
 * A single pre-installation validation check to run on the target device
 * before attempting to install an application.
 */
export interface AppPreInstallCheck {
    /** Unique identifier for the check */
    id: string;
    /** Human-readable description of what is being checked */
    description: string;
    /** Shell command to run on the target device to perform the check */
    command: string;
    /**
     * Minimum required version, if this check validates a version number.
     * The command's output is scanned for a version string and compared
     * against this value.
     */
    minVersion?: string;
    /**
     * Whether a failed check should block installation ('blocking', the
     * default) or merely warn the user while installation proceeds
     * ('warning').
     */
    severity?: 'blocking' | 'warning';
    /** Message to surface to the user when this check fails */
    failMessage: string;
}

/**
 * Application definition with installation commands and metadata.
 */
export interface AppDefinition {
    /** Unique identifier for the application */
    id: string;
    /** Display name */
    name: string;
    /** Icon emoji */
    icon: string;
    /** Short description */
    description: string;
    /** List of key features */
    features: string[];
    /** Category this app belongs to */
    category: string;
    /** Shell command to install the application */
    installCommand: string;
    /** Shell command to verify installation */
    verifyCommand: string;
    /** Shell command to uninstall (undefined means cannot be uninstalled) */
    uninstallCommand?: string;
    /** Whether this app requires a virtual environment */
    requiresVirtualEnv?: boolean;
    /** List of app IDs that must be installed before this app */
    dependencies?: string[];
    /** Validation checks to run on the target device before installing */
    preInstallChecks?: AppPreInstallCheck[];
}

/**
 * Application category grouping related apps.
 */
export interface AppCategory {
    /** Unique identifier for the category */
    id: string;
    /** Display name */
    name: string;
    /** Category description */
    description: string;
    /** Applications in this category */
    apps: AppDefinition[];
    /**
     * deviceType to feature or de-emphasize the category based on 
     * the target type. Categories without this field are shown for all devices.
     */
    deviceType?: string;
}

/**
 * All available application categories and their apps.
 * Ported from original machineManagerProvider.ts.
 */
export const APP_CATEGORIES: AppCategory[] = [
    {
        id: 'model-serving',
        name: 'Model Serving',
        description: 'Model serving and management tools for supported devices',
        deviceType: 'zgx_fury',
        apps: [
            {
                id: 'zrt',
                name: 'HP Z Runtime',
                icon: '⚡',
                description: 'Command-line wrapper around vLLM for serving large language models',
                features: [
                    'Pull and run models from popular model hubs',
                    'Serve models with a single command',
                    'Streamlined model lifecycle management',
                    'OpenAI-compatible API endpoints for LLM inference'
                ],
                category: 'model-serving',
                installCommand: 'sudo snap install --classic zrt && hash -r',
                verifyCommand: 'snap list zrt && /snap/bin/zrt version',
                uninstallCommand: 'sudo snap remove zrt',
                dependencies: ['snapd'],
                preInstallChecks: [
                    {
                        id: 'nvidia-driver-present',
                        description: 'Check that an NVIDIA GPU driver is installed',
                        command: 'nvidia-smi --query-gpu=name,driver_version,memory.total --format=csv,noheader',
                        severity: 'blocking',
                        failMessage: 'No NVIDIA GPU driver was detected on this device. HP Z Runtime requires an NVIDIA GPU with a working driver (nvidia-smi) to run.'
                    }
                ]
            }
        ]
    },
    {
        id: 'system-stack',
        name: 'System Stack',
        description: 'Essential system libraries, development tools, and monitoring applications',
        apps: [
            {
                id: 'base-system',
                name: 'Base System',
                icon: '🔧',
                description: 'Python development environment and essential libraries',
                features: [
                    'Python 3.12 with dev tools',
                    'Build essentials (gcc, g++, make)',
                    'Graphics and system libraries'
                ],
                category: 'system-stack',
                installCommand: 'sudo apt update && sudo apt install -y python3.12-dev python3.12-venv libgl1 libglib2.0-0 python3-pip build-essential gcc g++ make',
                verifyCommand: 'python3.12 --version && gcc --version',
                uninstallCommand: undefined // Base System should NEVER be uninstalled
            },
            {
                id: 'podman',
                name: 'Podman',
                icon: '🦭',
                description: 'Daemonless container engine',
                features: [
                    'Docker-compatible',
                    'Rootless containers',
                    'Kubernetes pod support'
                ],
                category: 'system-stack',
                installCommand: 'sudo apt update && sudo apt install -y podman',
                verifyCommand: 'podman --version',
                uninstallCommand: 'sudo apt remove -y podman'
            },
            {
                id: 'ollama',
                name: 'Ollama',
                icon: '🤖',
                description: 'Local AI model runner',
                features: [
                    'Run LLMs locally',
                    'CPU and GPU support',
                    'Multiple model formats'
                ],
                category: 'system-stack',
                installCommand: 'curl -fsSL https://ollama.com/install.sh | sudo sh && sudo systemctl daemon-reload && sudo systemctl enable ollama && sudo systemctl restart ollama && sleep 10 && sudo systemctl is-active ollama && timeout 15 bash -c "until curl -s http://127.0.0.1:11434/api/version >/dev/null 2>&1; do sleep 2; done" && echo "Ollama API is ready"',
                verifyCommand: 'ollama --version >/dev/null && curl -s http://127.0.0.1:11434/api/version >/dev/null',
                uninstallCommand: 'sudo systemctl stop ollama 2>/dev/null; sudo systemctl disable ollama 2>/dev/null; sudo rm -f /usr/local/bin/ollama; sudo rm -f /etc/systemd/system/ollama.service; sudo rm -f /usr/lib/systemd/user/ollama.service; sudo systemctl daemon-reload; sudo rm -rf /usr/share/ollama; rm -rf ~/.ollama; sudo userdel ollama 2>/dev/null; sudo groupdel ollama 2>/dev/null; echo "Ollama cleanup complete!"',
                dependencies: ['curl']
            },
            {
                id: 'miniforge',
                name: 'Miniforge',
                icon: '📦',
                description: 'Package and environment manager',
                features: [
                    'Cross-platform packages',
                    'Environment management',
                    'Data science computing focus'
                ],
                category: 'system-stack',
                installCommand: 'ARCH=$(uname -m); if [ "$ARCH" = "aarch64" ] || [ "$ARCH" = "arm64" ]; then MINIFORGE_URL="https://github.com/conda-forge/miniforge/releases/latest/download/Miniforge3-Linux-aarch64.sh"; elif [ "$ARCH" = "x86_64" ]; then MINIFORGE_URL="https://github.com/conda-forge/miniforge/releases/latest/download/Miniforge3-Linux-x86_64.sh"; else echo "Unsupported architecture: $ARCH" && exit 1; fi && curl -fsSL "$MINIFORGE_URL" -o miniforge.sh && bash miniforge.sh -b -p $HOME/miniforge3 && rm miniforge.sh && $HOME/miniforge3/bin/conda init bash && echo "export PATH=$HOME/miniforge3/bin:$PATH" >> ~/.bashrc',
                verifyCommand: '$HOME/miniforge3/bin/conda --version',
                uninstallCommand: 'rm -rf ~/miniforge3; sed -i \'/# >>> conda initialize >>>/,/# <<< conda initialize <<</d\' ~/.bashrc 2>/dev/null || true; rm -rf ~/.conda ~/.conda_envs ~/.condarc ~/.conda/config.yaml 2>/dev/null || true',
                dependencies: ['curl']
            },
            {
                id: 'snapd',
                name: 'snapd',
                icon: '🧩',
                description: 'Snap package management service for Linux',
                features: [
                    'Install snap packages from the Snap Store',
                    'Automatic background updates',
                    'Sandboxed application support'
                ],
                category: 'system-stack',
                installCommand: 'sudo apt update && sudo apt install -y snapd && sudo systemctl enable --now snapd.socket',
                verifyCommand: 'snap --version',
                uninstallCommand: 'sudo apt remove -y snapd'
            },
            {
                id: 'curl',
                name: 'curl',
                icon: '🌐',
                description: 'Command-line data transfer tool',
                features: [
                    'HTTP/HTTPS requests',
                    'File downloads',
                    'API testing'
                ],
                category: 'system-stack',
                installCommand: 'sudo apt install -y curl',
                verifyCommand: 'curl --version',
                uninstallCommand: 'sudo apt remove -y curl'
            },
            {
                id: 'nvtop',
                name: 'nvtop',
                icon: '📊',
                description: 'GPU monitoring utility',
                features: [
                    'Real-time NVIDIA GPU stats',
                    'Memory usage tracking',
                    'Process monitoring'
                ],
                category: 'system-stack',
                installCommand: 'sudo apt install -y nvtop',
                verifyCommand: 'dpkg -l nvtop | grep -q "^ii"',
                uninstallCommand: 'sudo apt remove -y nvtop'
            },
            {
                id: 'btop',
                name: 'btop',
                icon: '📈',
                description: 'System performance monitor',
                features: [
                    'CPU, memory, and processes stats',
                    'Disk I/O monitoring',
                    'Network performance'
                ],
                category: 'system-stack',
                installCommand: 'sudo apt install -y btop',
                verifyCommand: 'btop -h',
                uninstallCommand: 'sudo apt remove -y btop'
            },
            {
                id: 'screen',
                name: 'screen',
                icon: '🖥️',
                description: 'Terminal session manager',
                features: [
                    'Persistent sessions',
                    'Detach/attach capability',
                    'Multiple terminal windows'
                ],
                category: 'system-stack',
                installCommand: 'sudo apt install -y screen',
                verifyCommand: 'screen --version',
                uninstallCommand: 'sudo apt remove -y screen'
            }
        ]
    },
    {
        id: 'python-tools',
        name: 'Python Tools',
        description: 'Python development environment and AI/ML tools. A virtual environment named \'zgx\' will be created with Miniforge for selected tools.',
        apps: [
            {
                id: 'zgx-python-env',
                name: 'ZGX Python Environment',
                icon: '🐍',
                description: 'Modern Python environment for AI development on Z devices',
                features: [
                    'Python 3.12 conda environment',
                    'PyTorch 2.9 and CUDA 13',
                    'Transformers and core data science libraries'
                ],
                category: 'python-tools',
                installCommand: '$HOME/miniforge3/bin/conda create -n zgx python=3.12 -y && $HOME/miniforge3/bin/conda run -n zgx pip3 install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu130 && $HOME/miniforge3/bin/conda run -n zgx pip install numpy pandas scikit-learn matplotlib pillow seaborn torchtune torchao tqdm transformers diffusers accelerate datasets',
                verifyCommand: '$HOME/miniforge3/bin/conda env list | grep zgx && $HOME/miniforge3/bin/conda run -n zgx python -c "import torch; import transformers; print(f\'PyTorch: {torch.__version__}, Transformers: {transformers.__version__}\')"',
                uninstallCommand: '$HOME/miniforge3/bin/conda env remove -n zgx -y',
                requiresVirtualEnv: true,
                dependencies: ['miniforge']
            },
            {
                id: 'jupyter-lab',
                name: 'Jupyter Lab',
                icon: '📓',
                description: 'Interactive development environment',
                features: [
                    'Notebook interface',
                    'Code execution',
                    'Data visualization'
                ],
                category: 'python-tools',
                installCommand: '$HOME/miniforge3/bin/conda run -n zgx conda install jupyterlab -y',
                verifyCommand: '$HOME/miniforge3/bin/conda run -n zgx jupyter lab --version',
                uninstallCommand: '$HOME/miniforge3/bin/conda remove -n zgx jupyterlab -y && $HOME/miniforge3/bin/conda clean -a -y',
                requiresVirtualEnv: true,
                dependencies: ['zgx-python-env']
            },
            {
                id: 'streamlit',
                name: 'Streamlit',
                icon: '⚡',
                description: 'Web app framework for ML',
                features: [
                    'Rapid prototyping',
                    'Interactive widgets',
                    'Data apps'
                ],
                category: 'python-tools',
                installCommand: '$HOME/miniforge3/bin/conda run -n zgx pip install streamlit',
                verifyCommand: '$HOME/miniforge3/bin/conda run -n zgx streamlit version',
                uninstallCommand: '$HOME/miniforge3/bin/conda run -n zgx pip uninstall -y streamlit',
                requiresVirtualEnv: true,
                dependencies: ['zgx-python-env']
            },
            {
                id: 'gradio',
                name: 'Gradio',
                icon: '🎨',
                description: 'Build ML web interfaces quickly',
                features: [
                    'Simple Python API',
                    'Share demos instantly',
                    'Built-in components'
                ],
                category: 'python-tools',
                installCommand: '$HOME/miniforge3/bin/conda run -n zgx pip install gradio',
                verifyCommand: '$HOME/miniforge3/bin/conda run -n zgx python -c "import gradio; print(gradio.__version__)"',
                uninstallCommand: '$HOME/miniforge3/bin/conda run -n zgx pip uninstall -y gradio',
                requiresVirtualEnv: true,
                dependencies: ['zgx-python-env']
            },
            {
                id: 'open-webui',
                name: 'Open WebUI',
                icon: '🌐',
                description: 'Web interface for AI models',
                features: [
                    'Chat interface',
                    'Model management',
                    'Ollama integration'
                ],
                category: 'python-tools',
                installCommand: '$HOME/miniforge3/bin/conda run -n zgx pip install open-webui',
                verifyCommand: '$HOME/miniforge3/bin/conda run -n zgx open-webui --help',
                uninstallCommand: '$HOME/miniforge3/bin/conda run -n zgx pip uninstall -y open-webui',
                requiresVirtualEnv: true,
                dependencies: ['zgx-python-env']
            },
            {
                id: 'langchain',
                name: 'LangChain',
                icon: '📃',
                description: 'LangChain and tools for RAG applications',
                features: [
                    'Base LangChain library',
                    'Community and Ollama extensions',
                    'FAISS vector store'
                ],
                category: 'python-tools',
                installCommand: '$HOME/miniforge3/bin/conda run -n zgx pip install faiss-cpu langchain langchain-community langchain-text-splitters langchain-ollama pypdf',
                verifyCommand: '$HOME/miniforge3/bin/conda run -n zgx python -c "import langchain; import langchain_community; import langchain_text_splitters; import langchain_ollama; import pypdf; print(langchain.__version__); print(langchain_community.__version__); print(langchain_ollama.__version__); print(pypdf.__version__)"',
                uninstallCommand: '$HOME/miniforge3/bin/conda run -n zgx pip uninstall -y faiss-cpu langchain langchain-community langchain-text-splitters langchain-ollama pypdf',

                requiresVirtualEnv: true,
                dependencies: ['zgx-python-env']
            },
            {
                id: 'mlflow',
                name: 'MLFlow',
                icon: '🔄',
                description: 'ML lifecycle management',
                features: [
                    'Experiment tracking',
                    'Model registry',
                    'Deployment tools'
                ],
                category: 'python-tools',
                installCommand: '$HOME/miniforge3/bin/conda run -n zgx pip install mlflow',
                verifyCommand: '$HOME/miniforge3/bin/conda run -n zgx mlflow --version',
                uninstallCommand: '$HOME/miniforge3/bin/conda run -n zgx pip uninstall -y mlflow',
                requiresVirtualEnv: true,
                dependencies: ['zgx-python-env']
            },
            {
                id: 'uv',
                name: 'uv',
                icon: '🚀',
                description: 'Fast Python package installer',
                features: [
                    'Ultra-fast installs',
                    'Pip compatibility',
                    'Dependency resolution'
                ],
                category: 'python-tools',
                installCommand: '$HOME/miniforge3/bin/conda run -n zgx pip install uv',
                verifyCommand: '$HOME/miniforge3/bin/conda run -n zgx uv --version',
                uninstallCommand: '$HOME/miniforge3/bin/conda run -n zgx pip uninstall -y uv',
                requiresVirtualEnv: true,
                dependencies: ['zgx-python-env']
            },
            {
                id: 'poetry',
                name: 'poetry',
                icon: '📝',
                description: 'Python dependency management',
                features: [
                    'Lock file support',
                    'Virtual environments',
                    'Build and publish'
                ],
                category: 'python-tools',
                installCommand: '$HOME/miniforge3/bin/conda run -n zgx pip install poetry',
                verifyCommand: '$HOME/miniforge3/bin/conda run -n zgx poetry --version',
                uninstallCommand: '$HOME/miniforge3/bin/conda run -n zgx pip uninstall -y poetry',
                requiresVirtualEnv: true,
                dependencies: ['zgx-python-env']
            }
        ]
    }
];

/**
 * Get all apps as a flat array.
 */
export function getAllApps(): AppDefinition[] {
    return APP_CATEGORIES.flatMap(cat => cat.apps);
}

/**
 * Get app by ID.
 */
export function getAppById(id: string): AppDefinition | undefined {
    return getAllApps().find(app => app.id === id);
}

/**
 * Get category by ID.
 */
export function getCategoryById(id: string): AppCategory | undefined {
    return APP_CATEGORIES.find(cat => cat.id === id);
}
