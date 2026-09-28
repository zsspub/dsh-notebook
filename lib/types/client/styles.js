/** Layout-only styles; controls and interaction chrome come from DSH primitives. */
export const triggerStyles = `
.dsh-notebook-trigger{display:inline-flex;align-self:stretch;align-items:center;justify-content:center;gap:8px;width:36px;height:36px;margin:0;padding:0;border:0;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;cursor:pointer}
.dsh-notebook-trigger[data-wide=true]{width:100%;height:42px;justify-content:flex-start;padding-inline:8px}.dsh-notebook-trigger span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
`;
export const styles = `
.dsh-notebook{container-type:inline-size;display:flex;width:100%;height:100%;min-width:0;min-height:0;overflow:hidden;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font:inherit}
.dsh-notebook *{box-sizing:border-box}.dsh-notebook h2,.dsh-notebook h3,.dsh-notebook p{margin:0}
.dsh-notebook-actions,.dsh-notebook-meta,.dsh-notebook-pills,.dsh-notebook-scope,.dsh-notebook-menu-label{display:flex;align-items:center;gap:8px}
.dsh-notebook-list-pane{display:flex;width:100%;min-width:0;flex-direction:column}
.dsh-notebook-list-pane[hidden]{display:none}
.dsh-notebook-list-head{display:flex;flex-direction:column;gap:12px;padding:16px 18px}
.dsh-notebook-toolbar,.dsh-notebook-toolbar-actions,.dsh-notebook-scope-actions,.dsh-notebook-tags,.dsh-notebook-list-top,.dsh-notebook-list-summary{display:flex;align-items:center;gap:8px}
.dsh-notebook-toolbar{min-width:0;justify-content:space-between;flex-wrap:wrap}.dsh-notebook-scope{min-width:0}.dsh-notebook-scope-select{max-width:240px}.dsh-notebook-scope-label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsh-notebook-toolbar-actions{justify-content:flex-end;flex-wrap:wrap;margin-left:auto}.dsh-notebook-scope-actions{gap:2px}
.dsh-notebook-search{width:100%;min-width:0;height:36px}
.dsh-notebook-tags{flex-wrap:wrap}.dsh-notebook-tags-label{display:inline-flex;align-items:center;gap:5px;margin-right:2px;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:18px}
.dsh-notebook-menu-label{width:100%;justify-content:space-between}.dsh-notebook-menu-label>span:first-child{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.dsh-notebook-menu-label>span:last-child{color:var(--dsw-alias-label-secondary)}
.dsh-notebook-pills{flex-wrap:wrap}
.dsh-notebook-list{display:flex;min-height:0;flex:1;flex-direction:column;overflow:auto}
.dsh-notebook-list-summary{min-height:36px;justify-content:space-between;padding:2px 18px;border-bottom:0.5px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);font-size:11px}
.dsh-notebook-list-item{display:flex;flex:none;min-width:0;flex-direction:column;gap:6px;padding:14px 18px;border:0;border-bottom:0.5px solid var(--dsw-alias-border-l2);background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer;transition:background-color 120ms ease}
.dsh-notebook-list-item:hover,.dsh-notebook-list-item[aria-pressed=true]{background:var(--dsw-alias-interactive-bg-hover)}.dsh-notebook-list-item:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}
.dsh-notebook-list-top{min-width:0;justify-content:space-between;align-items:flex-start;gap:12px}.dsh-notebook-list-top h3{min-width:0;font-size:14px;line-height:20px;overflow-wrap:anywhere}.dsh-notebook-list-top time{flex:none;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:20px}
.dsh-notebook-list-item p{display:-webkit-box;max-width:72ch;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px;overflow:hidden;-webkit-box-orient:vertical;-webkit-line-clamp:2}.dsh-notebook-list-item .dsh-notebook-meta{gap:12px}
.dsh-notebook-list-more{display:flex;justify-content:center;padding:16px}
.dsh-notebook-detail{display:flex;min-width:0;min-height:0;flex:1;flex-direction:column}.dsh-notebook-detail[hidden]{display:none}.dsh-notebook-detail-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:16px;border-bottom:1px solid var(--dsw-alias-border-l2)}
.dsh-notebook-detail-head>div:first-child{min-width:0}.dsh-notebook-detail-head h2{font-size:18px;line-height:26px;overflow-wrap:anywhere}.dsh-notebook-meta{flex-wrap:wrap;color:var(--dsw-alias-label-secondary);font-size:11px;line-height:18px}
.dsh-notebook-detail-body{display:flex;min-height:0;flex:1;flex-direction:column;gap:16px;padding:16px;overflow:auto}.dsh-notebook-field{display:flex;flex-direction:column;gap:6px;color:var(--dsw-alias-label-secondary);font-size:12px}
.dsh-notebook-field textarea,.dsh-notebook-field select{width:100%;min-width:0;padding:8px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit}.dsh-notebook-field textarea{min-height:300px;resize:vertical}
.dsh-notebook-preview{min-height:240px;padding:4px}.dsh-notebook-empty{display:flex;min-height:220px;flex:1;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:24px;text-align:center;color:var(--dsw-alias-label-secondary)}
.dsh-notebook-empty h3{color:var(--dsw-alias-label-primary);font-size:15px}.dsh-notebook-empty svg{opacity:.75}
.dsh-notebook-actions{flex-wrap:wrap}.dsh-notebook-images{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:10px}.dsh-notebook-image{display:flex;min-width:0;flex-direction:column;gap:6px}.dsh-notebook-image img{width:100%;aspect-ratio:4/3;object-fit:cover;background:var(--dsw-alias-bg-layer-2)}.dsh-notebook-image span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-secondary);font-size:11px}
.dsh-notebook-history{display:flex;flex-direction:column;gap:8px}.dsh-notebook-history-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding-block:8px;border-top:1px solid var(--dsw-alias-border-l2)}
.dsh-notebook-error{padding:10px;color:var(--dsw-alias-label-error);background:var(--dsw-alias-state-error-secondary);font-size:12px}.dsh-notebook-modal-body{display:flex;flex-direction:column;gap:12px}.dsh-notebook-back{margin-bottom:8px}
@container(max-width:520px){.dsh-notebook-toolbar-actions{width:100%;justify-content:flex-start;margin-left:0}}
@container(max-width:420px){.dsh-notebook-list-head,.dsh-notebook-detail-head,.dsh-notebook-detail-body{padding:12px}.dsh-notebook-list-summary{padding-inline:12px}.dsh-notebook-list-item{padding:12px}.dsh-notebook-scope-select{max-width:180px}}
`;
export const toolCardStyles = `
.dsh-notebook-tool-card{--dsh-notebook-tool-fill:var(--dsw-static-neutral-50);box-sizing:border-box;display:flex;width:100%;min-width:0;min-height:60px;align-items:center;gap:10px;padding:8px 10px;overflow:hidden;border:0.5px solid var(--dsw-alias-border-l1);border-radius:18px;background:var(--dsh-notebook-tool-fill);color:var(--dsw-alias-label-primary);font-family:var(--dsw-font-family)}
body[data-ds-dark-theme] .dsh-notebook-tool-card{--dsh-notebook-tool-fill:var(--dsw-static-neutral-850)}
.dsh-notebook-tool-icon{box-sizing:border-box;display:grid;flex:none;place-items:center;width:40px;height:40px;border:0.5px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsh-notebook-tool-fill);color:var(--dsw-alias-link)}
.dsh-notebook-tool-details{display:flex;flex:1;min-width:0;flex-direction:column;justify-content:center;gap:2px}
.dsh-notebook-tool-details strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;font-weight:500;line-height:20px}
.dsh-notebook-tool-details>span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-tertiary);font-size:10px;font-weight:400;line-height:16px}
.dsh-notebook-tool-card[data-error] .dsh-notebook-tool-details>span{color:var(--dsw-alias-state-error-primary)}
.dsh-notebook-tool-meta{display:flex;flex:none;min-width:0;align-items:center;gap:6px}
`;
