'''
Copyright ©2025 HP Development Company, L.P.
Licensed under the X11 License. See LICENSE file in the project root for details.
'''

"""
Simple RAG Application using Streamlit, Ollama, and in-memory vector store
"""

import streamlit as st
from pathlib import Path
from typing import Tuple, Dict, Any, List

from langchain_ollama.llms import OllamaLLM
from langchain_ollama import OllamaEmbeddings
from langchain_community.document_loaders import PyPDFLoader
from langchain_community.vectorstores import FAISS

from langchain_text_splitters import RecursiveCharacterTextSplitter

from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langchain_core.runnables import RunnablePassthrough

# Configuration
PDF_PATH = "document.pdf"
CHUNK_SIZE = 256
CHUNK_OVERLAP = 32
EMBEDDING_MODEL = "nomic-embed-text"

# Initialize session state
if 'vectorstore' not in st.session_state:
    st.session_state.vectorstore = None
if 'qa_chain' not in st.session_state:
    st.session_state.qa_chain = None

def load_and_split_pdf(pdf_path: str) -> Tuple[List[Any], int]:
    """Load PDF and split into chunks"""
    loader = PyPDFLoader(pdf_path)
    documents = loader.load()
    
    # Split documents into chunks
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=CHUNK_SIZE,
        chunk_overlap=CHUNK_OVERLAP,
        length_function=len,
    )
    
    chunks = text_splitter.split_documents(documents)
    return chunks, len(documents)

def create_vectorstore(chunks: List[Any], embedding_model: str) -> FAISS:
    """Create vector store from document chunks"""
    embeddings = OllamaEmbeddings(model=embedding_model)
    vectorstore = FAISS.from_documents(chunks, embeddings)
    return vectorstore

def ingest_pdf() -> Tuple[bool, str, FAISS]:
    """Process PDF and create vector store"""
    if not Path(PDF_PATH).exists():
        return False, f"❌ {PDF_PATH} not found. Please upload or download a PDF first.", None
    
    try:
        with st.spinner(f"Loading PDF from {PDF_PATH}..."):
            chunks, num_pages = load_and_split_pdf(PDF_PATH)
        
        st.info(f"Loaded {num_pages} pages, split into {len(chunks)} chunks")
        
        with st.spinner(f"Creating embeddings using {EMBEDDING_MODEL}..."):
            vectorstore = create_vectorstore(chunks, EMBEDDING_MODEL)
        
        return True, "✅ PDF ingested successfully!", vectorstore
    except Exception as e:
        return False, f"❌ Error: {str(e)}", None

def initialize_qa_chain(vectorstore: FAISS, model_name: str = "llama3.2") -> Dict[str, Any]:
    """Initialize a retrieval-augmented generation chain with Ollama LLM.
    """
    llm = OllamaLLM(model=model_name, temperature=0)

    system_prompt = (
        "Use the following pieces of context to answer the question at the end. "
        "If you don't know the answer, just say that you don't know, don't try to make up an answer. "
        "The user will probably ask questions about a specific workstation product from HP."
        "Context will be provided from the user's manual. If they ask about anything else, "
        "politely inform them that you can only answer questions related to this specific HP workstation."
    )

    prompt = ChatPromptTemplate.from_messages(
        [
            ("system", system_prompt),
            (
                "human",
                "Context:\n{context}\n\n"
                "Question: {question}\n\n"
                "Answer:",
            ),
        ]
    )

    retriever = vectorstore.as_retriever(search_kwargs={"k": 3})

    def _format_docs(docs: List[Any]) -> str:
        return "\n\n".join(doc.page_content for doc in docs)

    # Build LCEL chain
    rag_chain = (
        {"context": retriever | _format_docs, "question": RunnablePassthrough()}
        | prompt
        | llm
        | StrOutputParser()
    )

    return {"chain": rag_chain, "retriever": retriever}

# Streamlit UI
st.title("RAG PDF Question Answering")

# Sidebar for configuration
with st.sidebar:
    st.header("Configuration")
    model_name = st.text_input("Ollama Model", value="llama3.2")
    
    st.markdown("---")
    st.markdown("### Instructions")
    st.markdown("""
    1. Click '🔄 Process PDF' to ingest the PDF and create the vector store
    2. Ask questions below
    
    Note: The vector store is kept in memory for the current session only.
    """)
    
    st.markdown("---")
    st.markdown("### Process PDF and Create Vector Store")
    st.markdown("Process the PDF and create the vector store in memory")
    
    if st.button("🔄 Process PDF", type="secondary"):
        success, message, vectorstore = ingest_pdf()
        if success:
            st.success(message)
            st.session_state.vectorstore = vectorstore
            if st.session_state.vectorstore:
                st.session_state.qa_chain = initialize_qa_chain(
                    st.session_state.vectorstore, 
                    model_name
                )
        else:
            st.error(message)
    
    # Show file status
    st.markdown("---")
    st.markdown("### File Status")
    pdf_exists = Path(PDF_PATH).exists()
    st.text(f"{'✅' if pdf_exists else '❌'} {PDF_PATH}")

# Main interface
if st.session_state.vectorstore is None or st.session_state.qa_chain is None:
    st.warning("⚠️ Please process the PDF and load the vector store using the sidebar.")
else:
    # Question input with form to enable Enter key submission
    with st.form(key="question_form", clear_on_submit=False):
        question = st.text_input("Ask a question about your document:", 
                                placeholder="What is this document about?")
        submit_button = st.form_submit_button("Get Answer", type="primary")
    
    if submit_button and question:
        with st.spinner("Processing..."):
            try:
                qa_bundle = st.session_state.qa_chain
                answer = qa_bundle["chain"].invoke(question)

                # Display answer
                st.markdown("### Answer")
                st.write(answer)

                # Display source documents
                with st.expander("View Source Context"):
                    source_docs = qa_bundle["retriever"].invoke(question)
                    for i, doc in enumerate(source_docs, 1):
                        st.markdown(f"**Source {i}:**")
                        st.text(doc.page_content[:500] + "...")
                        st.markdown("---")
                        
            except Exception as e:
                st.error(f"Error: {str(e)}")
                st.info("Make sure Ollama is running: `ollama serve`")
