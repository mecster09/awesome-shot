import { Palette, PanelRightOpen, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { AlertDialog, Button, Card, Dialog, DialogClose, DialogContent, Drawer, Input, Select, Tabs, TabsContent, TabsList, TabsTrigger } from "./components/ui";

export function FoundationPreview({ onBack }: { onBack: () => void }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  return <section className="match-area focused-screen foundation-preview" aria-labelledby="foundation-title">
    <div className="section-heading"><div><p className="eyebrow">PROTOTYPE FOUNDATION</p><h2 id="foundation-title">Prototype foundation</h2><p>Reusable controls, surfaces, and overlays for the upcoming Match screen migration.</p></div><Button variant="ghost" onClick={onBack}>Back to Settings</Button></div>
    <div className="foundation-token-strip" aria-label="Design tokens"><span><i className="token-rose" />Rose</span><span><i className="token-slate" />Slate</span><span><i className="token-surface" />Surface</span><span>Radius 14px</span><span>Space 16px</span></div>
    <div className="foundation-grid">
      <Card><div className="foundation-card-heading"><Palette aria-hidden="true" /><h3>Controls</h3></div><label htmlFor="foundation-team">Team name</label><Input id="foundation-team" placeholder="e.g. Roses" /><label htmlFor="foundation-disabled-team">Disabled team name</label><Input id="foundation-disabled-team" disabled placeholder="Unavailable" /><label htmlFor="foundation-surface">Surface</label><Select id="foundation-surface"><option>Standard surface</option><option>Raised surface</option></Select><div className="foundation-actions"><Button>Primary action</Button><Button variant="secondary">Secondary action</Button><Button disabled>Disabled action</Button></div></Card>
      <Card><div className="foundation-card-heading"><PanelRightOpen aria-hidden="true" /><h3>Overlays</h3></div><p>Drawers retain context while dialogs concentrate decisions and destructive confirmation.</p><div className="foundation-actions"><Button variant="secondary" onClick={() => setDrawerOpen(true)}>Open drawer</Button><Button variant="secondary" onClick={() => setDialogOpen(true)}>Open dialog</Button><Button variant="destructive" onClick={() => setConfirmationOpen(true)}>Open confirmation</Button></div></Card>
      <Card className="foundation-tabs-card"><Tabs defaultValue="overview"><TabsList aria-label="Foundation sections"><TabsTrigger value="overview">Overview</TabsTrigger><TabsTrigger value="focus">Focus states</TabsTrigger></TabsList><TabsContent value="overview"><p>Rose actions, slate text, high-contrast surfaces, and a consistent 14px radius establish the visual baseline.</p></TabsContent><TabsContent value="focus"><p>Every interactive primitive uses a visible rose focus ring and distinct disabled state.</p></TabsContent></Tabs></Card>
    </div>
    <Drawer open={drawerOpen} onOpenChange={setDrawerOpen} title="Foundation drawer"><p>This slide-in surface is ready for Event feed and contained Coach workflows.</p><Button onClick={() => setDrawerOpen(false)}>Done</Button></Drawer>
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogContent aria-label="Foundation dialog"><h2>Foundation dialog</h2><p>This centered dialog is ready for focused Match decisions.</p><DialogClose asChild><Button>Close dialog</Button></DialogClose></DialogContent></Dialog>
    <AlertDialog open={confirmationOpen} onOpenChange={setConfirmationOpen} title="Confirm destructive action"><div className="ui-alert-icon"><TriangleAlert aria-hidden="true" /></div><p>This demonstrates the confirmation treatment. It does not change any saved Match data.</p><div className="foundation-actions"><Button variant="secondary" onClick={() => setConfirmationOpen(false)}>Cancel</Button><Button variant="destructive" onClick={() => setConfirmationOpen(false)}>Confirm</Button></div></AlertDialog>
  </section>;
}
