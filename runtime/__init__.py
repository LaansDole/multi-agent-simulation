"""Runtime package — public API surface.

Uses lazy imports to avoid the circular dependency chain
check.check -> runtime.bootstrap.schema -> runtime -> runtime.sdk -> check.check
that occurs when this module eagerly imports runtime.sdk at load time.
"""

__all__ = ["WorkflowMetaInfo", "WorkflowRunResult", "run_workflow"]


def __getattr__(name: str):
    if name in __all__:
        from runtime.sdk import WorkflowMetaInfo, WorkflowRunResult, run_workflow

        _mapping = {
            "WorkflowMetaInfo": WorkflowMetaInfo,
            "WorkflowRunResult": WorkflowRunResult,
            "run_workflow": run_workflow,
        }
        return _mapping[name]
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
