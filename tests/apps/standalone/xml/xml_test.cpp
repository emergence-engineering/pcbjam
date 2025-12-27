// wxXmlDocument Test - XML parsing like KiCad's config and project files
// Tests: wxXmlDocument, wxXmlNode, parsing, creation, traversal

#include "wx/wx.h"
#include "wx/xml/xml.h"
#include "wx/sstream.h"

class XmlFrame : public wxFrame
{
public:
    XmlFrame() : wxFrame(nullptr, wxID_ANY, "wxXmlDocument Test",
                          wxDefaultPosition, wxSize(900, 700))
    {
        wxPanel* mainPanel = new wxPanel(this);
        wxBoxSizer* mainSizer = new wxBoxSizer(wxVERTICAL);

        // Description
        wxStaticText* desc = new wxStaticText(mainPanel, wxID_ANY,
            "KiCad uses wxXmlDocument for config/project files (665 occurrences).\n"
            "Tests: Parsing, node traversal, creation, modification, serialization.");
        mainSizer->Add(desc, 0, wxALL, 5);

        // Sample XML
        wxStaticBoxSizer* sampleSizer = new wxStaticBoxSizer(wxVERTICAL, mainPanel, "Sample XML (KiCad-like project)");

        m_xmlInput = new wxTextCtrl(mainPanel, wxID_ANY, GetSampleXml(),
                                     wxDefaultPosition, wxSize(-1, 150),
                                     wxTE_MULTILINE | wxTE_DONTWRAP);
        m_xmlInput->SetFont(wxFont(10, wxFONTFAMILY_MODERN, wxFONTSTYLE_NORMAL, wxFONTWEIGHT_NORMAL));
        sampleSizer->Add(m_xmlInput, 1, wxEXPAND | wxALL, 5);

        mainSizer->Add(sampleSizer, 0, wxEXPAND | wxALL, 5);

        // Buttons
        wxBoxSizer* btnSizer = new wxBoxSizer(wxHORIZONTAL);

        wxButton* parseBtn = new wxButton(mainPanel, wxID_ANY, "Parse XML");
        parseBtn->Bind(wxEVT_BUTTON, &XmlFrame::OnParseXml, this);
        btnSizer->Add(parseBtn, 0, wxRIGHT, 5);

        wxButton* traverseBtn = new wxButton(mainPanel, wxID_ANY, "Traverse Nodes");
        traverseBtn->Bind(wxEVT_BUTTON, &XmlFrame::OnTraverseNodes, this);
        btnSizer->Add(traverseBtn, 0, wxRIGHT, 5);

        wxButton* createBtn = new wxButton(mainPanel, wxID_ANY, "Create XML");
        createBtn->Bind(wxEVT_BUTTON, &XmlFrame::OnCreateXml, this);
        btnSizer->Add(createBtn, 0, wxRIGHT, 5);

        wxButton* modifyBtn = new wxButton(mainPanel, wxID_ANY, "Modify XML");
        modifyBtn->Bind(wxEVT_BUTTON, &XmlFrame::OnModifyXml, this);
        btnSizer->Add(modifyBtn, 0, wxRIGHT, 5);

        wxButton* serializeBtn = new wxButton(mainPanel, wxID_ANY, "Serialize");
        serializeBtn->Bind(wxEVT_BUTTON, &XmlFrame::OnSerializeXml, this);
        btnSizer->Add(serializeBtn, 0);

        mainSizer->Add(btnSizer, 0, wxALL, 5);

        // Results
        wxStaticBoxSizer* resultSizer = new wxStaticBoxSizer(wxVERTICAL, mainPanel, "Results / Output");

        m_output = new wxTextCtrl(mainPanel, wxID_ANY, "",
                                   wxDefaultPosition, wxSize(-1, 200),
                                   wxTE_MULTILINE | wxTE_READONLY | wxTE_DONTWRAP);
        m_output->SetFont(wxFont(10, wxFONTFAMILY_MODERN, wxFONTSTYLE_NORMAL, wxFONTWEIGHT_NORMAL));
        resultSizer->Add(m_output, 1, wxEXPAND | wxALL, 5);

        mainSizer->Add(resultSizer, 1, wxEXPAND | wxALL, 5);

        // Event log
        mainSizer->Add(new wxStaticText(mainPanel, wxID_ANY, "Event Log"), 0, wxLEFT | wxTOP, 5);
        m_log = new wxTextCtrl(mainPanel, wxID_ANY, "", wxDefaultPosition, wxSize(-1, 80),
                               wxTE_MULTILINE | wxTE_READONLY);
        mainSizer->Add(m_log, 0, wxEXPAND | wxALL, 5);

        mainPanel->SetSizer(mainSizer);

        CreateStatusBar();
        SetStatusText("XML test app started");
        Log("XML test app started");
    }

private:
    wxString GetSampleXml()
    {
        return
            "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n"
            "<kicad_project version=\"1\">\n"
            "  <general>\n"
            "    <name>MyProject</name>\n"
            "    <version>8.0</version>\n"
            "  </general>\n"
            "  <schematic>\n"
            "    <drawing>\n"
            "      <sheet name=\"Root\" page=\"A4\"/>\n"
            "    </drawing>\n"
            "  </schematic>\n"
            "  <pcb>\n"
            "    <layers count=\"4\">\n"
            "      <layer id=\"0\" name=\"F.Cu\" type=\"copper\"/>\n"
            "      <layer id=\"1\" name=\"In1.Cu\" type=\"copper\"/>\n"
            "      <layer id=\"2\" name=\"In2.Cu\" type=\"copper\"/>\n"
            "      <layer id=\"31\" name=\"B.Cu\" type=\"copper\"/>\n"
            "    </layers>\n"
            "    <design_rules>\n"
            "      <track_width min=\"0.2\" default=\"0.25\"/>\n"
            "      <via_size min=\"0.4\" default=\"0.8\"/>\n"
            "    </design_rules>\n"
            "  </pcb>\n"
            "</kicad_project>\n";
    }

    void OnParseXml(wxCommandEvent& event)
    {
        Log("Parsing XML...");
        m_output->Clear();

        wxString xmlStr = m_xmlInput->GetValue();
        wxStringInputStream stream(xmlStr);

        wxXmlDocument doc;
        if (!doc.Load(stream))
        {
            Output("ERROR: Failed to parse XML");
            Log("Parse failed");
            return;
        }

        wxXmlNode* root = doc.GetRoot();
        if (!root)
        {
            Output("ERROR: No root element");
            return;
        }

        Output(wxString::Format("Parse successful!\n"));
        Output(wxString::Format("Root element: <%s>\n", root->GetName()));
        Output(wxString::Format("Version attribute: %s\n", root->GetAttribute("version", "none")));

        // Count children
        int childCount = 0;
        wxXmlNode* child = root->GetChildren();
        while (child)
        {
            if (child->GetType() == wxXML_ELEMENT_NODE)
                childCount++;
            child = child->GetNext();
        }
        Output(wxString::Format("Child elements: %d\n", childCount));

        Log("Parse complete");
    }

    void OnTraverseNodes(wxCommandEvent& event)
    {
        Log("Traversing XML nodes...");
        m_output->Clear();

        wxString xmlStr = m_xmlInput->GetValue();
        wxStringInputStream stream(xmlStr);

        wxXmlDocument doc;
        if (!doc.Load(stream))
        {
            Output("ERROR: Failed to parse XML");
            return;
        }

        wxXmlNode* root = doc.GetRoot();
        TraverseNode(root, 0);

        Log("Traversal complete");
    }

    void TraverseNode(wxXmlNode* node, int depth)
    {
        if (!node) return;

        wxString indent(depth * 2, ' ');

        if (node->GetType() == wxXML_ELEMENT_NODE)
        {
            wxString attrs;
            wxXmlAttribute* attr = node->GetAttributes();
            while (attr)
            {
                attrs += wxString::Format(" %s=\"%s\"", attr->GetName(), attr->GetValue());
                attr = attr->GetNext();
            }

            wxString content = node->GetNodeContent().Trim();
            if (!content.IsEmpty())
            {
                Output(wxString::Format("%s<%s%s>%s</%s>\n",
                                         indent, node->GetName(), attrs, content, node->GetName()));
            }
            else
            {
                Output(wxString::Format("%s<%s%s>\n", indent, node->GetName(), attrs));

                // Traverse children
                wxXmlNode* child = node->GetChildren();
                while (child)
                {
                    TraverseNode(child, depth + 1);
                    child = child->GetNext();
                }

                if (node->GetChildren())
                    Output(wxString::Format("%s</%s>\n", indent, node->GetName()));
            }
        }
    }

    void OnCreateXml(wxCommandEvent& event)
    {
        Log("Creating new XML document...");
        m_output->Clear();

        // Create a new document
        wxXmlDocument doc;
        doc.SetVersion("1.0");
        doc.SetFileEncoding("UTF-8");

        // Create root element
        wxXmlNode* root = new wxXmlNode(wxXML_ELEMENT_NODE, "component");
        root->AddAttribute("type", "resistor");
        doc.SetRoot(root);

        // Add child elements
        wxXmlNode* refNode = new wxXmlNode(root, wxXML_ELEMENT_NODE, "reference");
        refNode->AddChild(new wxXmlNode(wxXML_TEXT_NODE, "", "R1"));

        wxXmlNode* valueNode = new wxXmlNode(root, wxXML_ELEMENT_NODE, "value");
        valueNode->AddChild(new wxXmlNode(wxXML_TEXT_NODE, "", "10k"));

        wxXmlNode* footprintNode = new wxXmlNode(root, wxXML_ELEMENT_NODE, "footprint");
        footprintNode->AddChild(new wxXmlNode(wxXML_TEXT_NODE, "", "Resistor_SMD:R_0402"));

        // Properties
        wxXmlNode* propsNode = new wxXmlNode(root, wxXML_ELEMENT_NODE, "properties");

        wxXmlNode* prop1 = new wxXmlNode(propsNode, wxXML_ELEMENT_NODE, "property");
        prop1->AddAttribute("name", "tolerance");
        prop1->AddAttribute("value", "1%");

        wxXmlNode* prop2 = new wxXmlNode(propsNode, wxXML_ELEMENT_NODE, "property");
        prop2->AddAttribute("name", "power");
        prop2->AddAttribute("value", "0.1W");

        // Serialize to string
        wxStringOutputStream outStream;
        if (doc.Save(outStream))
        {
            Output("Created XML document:\n\n");
            Output(outStream.GetString());
        }
        else
        {
            Output("ERROR: Failed to serialize");
        }

        Log("XML creation complete");
    }

    void OnModifyXml(wxCommandEvent& event)
    {
        Log("Modifying XML...");
        m_output->Clear();

        wxString xmlStr = m_xmlInput->GetValue();
        wxStringInputStream stream(xmlStr);

        wxXmlDocument doc;
        if (!doc.Load(stream))
        {
            Output("ERROR: Failed to parse XML");
            return;
        }

        wxXmlNode* root = doc.GetRoot();

        // Find and modify the general/name element
        wxXmlNode* general = FindChild(root, "general");
        if (general)
        {
            wxXmlNode* name = FindChild(general, "name");
            if (name && name->GetChildren())
            {
                wxString oldName = name->GetNodeContent();
                name->GetChildren()->SetContent("ModifiedProject");
                Output(wxString::Format("Changed project name: '%s' -> 'ModifiedProject'\n", oldName));
            }
        }

        // Add a new element to pcb
        wxXmlNode* pcb = FindChild(root, "pcb");
        if (pcb)
        {
            wxXmlNode* newElem = new wxXmlNode(wxXML_ELEMENT_NODE, "modified");
            newElem->AddAttribute("timestamp", wxDateTime::Now().FormatISOCombined());
            pcb->AddChild(newElem);
            Output("Added <modified> element to <pcb>\n");
        }

        // Serialize modified document
        wxStringOutputStream outStream;
        if (doc.Save(outStream))
        {
            Output("\nModified XML:\n");
            Output(outStream.GetString());
        }

        Log("Modification complete");
    }

    void OnSerializeXml(wxCommandEvent& event)
    {
        Log("Serializing XML...");
        m_output->Clear();

        wxString xmlStr = m_xmlInput->GetValue();
        wxStringInputStream inStream(xmlStr);

        wxXmlDocument doc;
        if (!doc.Load(inStream))
        {
            Output("ERROR: Failed to parse XML");
            return;
        }

        // Serialize with formatting
        wxStringOutputStream outStream;
        if (doc.Save(outStream, 2))  // Indent with 2 spaces
        {
            Output("Serialized XML (formatted):\n\n");
            Output(outStream.GetString());

            // Show statistics
            wxString serialized = outStream.GetString();
            Output(wxString::Format("\n--- Statistics ---\n"));
            Output(wxString::Format("Total size: %zu bytes\n", serialized.Length()));
            Output(wxString::Format("Lines: %d\n", serialized.Freq('\n') + 1));
        }

        Log("Serialization complete");
    }

    wxXmlNode* FindChild(wxXmlNode* parent, const wxString& name)
    {
        if (!parent) return nullptr;

        wxXmlNode* child = parent->GetChildren();
        while (child)
        {
            if (child->GetType() == wxXML_ELEMENT_NODE && child->GetName() == name)
                return child;
            child = child->GetNext();
        }
        return nullptr;
    }

    void Output(const wxString& text)
    {
        m_output->AppendText(text);
    }

    void Log(const wxString& msg)
    {
        m_log->AppendText(msg + "\n");
    }

    wxTextCtrl* m_xmlInput;
    wxTextCtrl* m_output;
    wxTextCtrl* m_log;
};

class XmlApp : public wxApp
{
public:
    virtual bool OnInit() override
    {
        XmlFrame* frame = new XmlFrame();
        frame->Show();
        return true;
    }
};

wxIMPLEMENT_APP(XmlApp);
