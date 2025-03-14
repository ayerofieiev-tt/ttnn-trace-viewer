from setuptools import setup, find_packages

with open("README.md", "r", encoding="utf-8") as fh:
    long_description = fh.read()

with open("requirements.txt", "r", encoding="utf-8") as fh:
    requirements = [line.strip() for line in fh if line.strip() and not line.startswith("#")]

setup(
    name="ttnn_capture",
    version="0.1.0",
    author="TTNN Capture Team",
    description="A tool for capturing and analyzing trace data",
    long_description=long_description,
    long_description_content_type="text/markdown",
    url="https://github.com/yourusername/ttnn_capture",
    packages=find_packages(),
    classifiers=[
        "Programming Language :: Python :: 3",
        "License :: OSI Approved :: MIT License",
        "Operating System :: OS Independent",
    ],
    python_requires=">=3.6",
    install_requires=requirements,
    entry_points={
        "console_scripts": [
            "ttnn-trace-viewer=trace_viewer:main",
            "ttnn-store=store_traces:main",
            "ttnn-to-csv=ttnn_capture_to_csv:main",
            "ttnn-to-sheets=upload_to_sheets:main",
        ],
    },
    include_package_data=True,
    package_data={
        "ttnn_capture": ["templates/*"],
    },
) 